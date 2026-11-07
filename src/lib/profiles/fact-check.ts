import "server-only";
import type { Db } from "@/db/client";
import { env } from "@/lib/env";
import { skillKey } from "@/lib/matching";
import { totalYears, type ResourceInput } from "@/lib/resources/types";
import type { AiSettings } from "@/lib/settings";
import { callStructured } from "./ai";
import { recordForAi } from "./generate";
import { factCheckOutputSchema, type FactCheck, type FactFlag, type ProfileContent } from "./types";

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2));

/** Share of a's meaningful words found in b. */
function overlap(a: string, b: string) {
  const ta = tokens(a);
  if (ta.size === 0) return 1;
  const tb = tokens(b);
  return [...ta].filter((t) => tb.has(t)).length / ta.size;
}

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Mechanical checks that need no AI: skills, projects, awards, education, and numbers must trace
 * back to the record; client names must not appear; section limits are reported.
 */
export function ruleChecks(p: ProfileContent, record: ResourceInput, ai: AiSettings): FactFlag[] {
  const flags: FactFlag[] = [];
  const flag = (section: string, quote: string, issue: string, severity: FactFlag["severity"]) => flags.push({ section, quote, issue, severity, source: "rules" });

  const known = new Set([...record.skills.map((s) => s.name), ...record.projects.flatMap((x) => x.technologies)].map(skillKey));
  const knownWords = [...known];
  // Exact (normalized) match, or a containment match for names of 3+ characters ("AWS" ↔ "AWS Lambda").
  const supported = (item: string) => {
    const key = skillKey(item);
    return known.has(key) || (key.length >= 3 && knownWords.some((k) => k.length >= 3 && (k.includes(key) || key.includes(k))));
  };

  for (const group of p.technicalExpertise) for (const item of group.items) if (!supported(item)) flag("Technical expertise", item, "Not in the resource's tech stack or project technologies.", "high");

  const byName = new Map(record.projects.map((x) => [x.name.trim().toLowerCase(), x]));
  for (const proj of p.projects) {
    const src = byName.get(proj.sourceProjectName.trim().toLowerCase());
    if (!src) {
      flag("Projects", proj.title, `Can't be traced to a project in the record ("${proj.sourceProjectName}").`, "high");
      continue;
    }
    const srcTech = new Set(src.technologies.map(skillKey));
    for (const t of proj.coreTechnologies) if (!srcTech.has(skillKey(t)) && !supported(t)) flag("Projects", `${proj.title}: ${t}`, "Technology not listed for this project or anywhere in the record.", "high");
    if (proj.contributions.length > ai.contributionsMax) flag("Projects", proj.title, `${proj.contributions.length} contributions; the limit is ${ai.contributionsMax}.`, "low");
    if (words(proj.description) > ai.projectDescriptionMaxWords) flag("Projects", proj.title, `Description is ${words(proj.description)} words; the limit is ${ai.projectDescriptionMaxWords}.`, "low");
  }

  const achievements = record.achievements.map((a) => `${a.name} ${a.issuer}`);
  for (const item of p.awardsAndCertifications) if (!achievements.some((a) => overlap(item, a) >= 0.6)) flag("Awards & certifications", item, "Doesn't match any achievement or certification in the record.", "high");

  const education = record.education.map((e) => `${e.degree} ${e.institution} ${e.year}`);
  for (const e of p.education) if (!education.some((x) => overlap(`${e.degree} ${e.institution}`, x) >= 0.6)) flag("Education", `${e.degree}, ${e.institution}`, "Doesn't match the education in the record.", "high");

  // Numbers (years, percentages, counts) must appear in the record.
  const recordText = JSON.stringify(record).toLowerCase();
  const years = totalYears(record);
  const allowed = new Set([years, years != null ? Math.floor(years) : null].filter((x) => x != null).map(String));
  const textParts: [string, string][] = [
    ["Career summary", p.careerSummary],
    ...p.coreCompetencies.map((c): [string, string] => ["Core competency", c]),
    ...p.projects.flatMap((x) => [x.description, ...x.contributions].map((t): [string, string] => [`Projects: ${x.title}`, t])),
  ];
  for (const [section, text] of textParts) {
    for (const num of text.match(/\d+(?:[.,]\d+)?/g) ?? []) {
      if (!allowed.has(num) && !recordText.includes(num.toLowerCase())) flag(section, text, `The number "${num}" isn't in the record.`, "medium");
    }
  }

  const full = JSON.stringify(p).toLowerCase();
  for (const client of record.projects.map((x) => x.clientName.trim()).filter((c) => c.length >= 3 && !/^enosis$/i.test(c))) {
    if (full.includes(client.toLowerCase())) flag("Whole profile", client, "Client name appears in the profile.", "high");
  }

  if (words(p.careerSummary) > ai.summaryMaxWords) flag("Career summary", p.careerSummary.slice(0, 80) + "…", `${words(p.careerSummary)} words; the limit is ${ai.summaryMaxWords}.`, "low");
  if (p.coreCompetencies.length > ai.competenciesMax || p.coreCompetencies.length < ai.competenciesMin)
    flag("Core competency", `${p.coreCompetencies.length} bullets`, `Should be ${ai.competenciesMin}-${ai.competenciesMax}.`, "low");
  return flags;
}

const FACT_CHECK_SYSTEM = `You are a meticulous fact-checker for talent profiles that a software services company sends to prospects. You compare a generated profile with the resource record it must be based on.

List every claim in the profile that the record does not support: invented or exaggerated skills, technologies, responsibilities, results, numbers, seniority, team sizes, durations, domains, awards, certifications, or education; and anything that names or identifies a client. Rewording, summarizing, and choosing what to emphasize are fine. Only flag claims that add information the record doesn't contain or contradict it.

For each flag give the section, the exact quote from the profile, why it is unsupported, and a severity: "high" for invented facts or client names, "medium" for exaggeration or unsupported specifics, "low" for minor overstatement. Return an empty list if everything is supported.`;

/** Rule checks, plus a second Claude pass that compares every claim with the record (when AI is configured). */
export async function factCheck(db: Db, p: ProfileContent, record: ResourceInput, ai: AiSettings, ctx: { requirementId: string; resourceId: string; profileId?: string; adminEmail: string }): Promise<FactCheck> {
  const flags = ruleChecks(p, record, ai);
  if (env.aiMode === "offline") return { flags, checkedAt: new Date().toISOString(), aiChecked: false, aiError: "AI is not configured (offline mode); only rule-based checks ran." };

  const user = `<resource_record>\n${JSON.stringify(recordForAi(record), null, 2)}\n</resource_record>\n\n<generated_profile>\n${JSON.stringify(p, null, 2)}\n</generated_profile>\n\nCheck every claim in the generated profile against the resource record.`;
  const result = await callStructured(db, { purpose: "fact_check", ...ctx }, factCheckOutputSchema, FACT_CHECK_SYSTEM, user);
  if (!result.ok) return { flags, checkedAt: new Date().toISOString(), aiChecked: false, aiError: result.error };
  return { flags: [...flags, ...result.data.flags.map((f) => ({ ...f, source: "ai" as const }))], checkedAt: new Date().toISOString(), aiChecked: true };
}
