import "server-only";
import type { Db } from "@/db/client";
import type { RequirementRow, ResourceRow } from "@/db/schema";
import { env } from "@/lib/env";
import { scoreResource, skillKey } from "@/lib/matching";
import { toInput } from "@/lib/resources/service";
import { SKILL_CATEGORIES, categoryLabel, totalYears, type ResourceInput } from "@/lib/resources/types";
import type { AiSettings } from "@/lib/settings";
import { callStructured } from "./ai";
import { generationOutputSchema, type GenerationOutput, type ProfileContent } from "./types";

const MAX_ATTEMPTS = 3;

/** What Claude sees of the record: no contact details, and client names removed so they can't leak. */
export function recordForAi(r: ResourceInput) {
  return {
    name: r.name,
    title: r.title,
    seniority: r.seniority,
    totalYearsExperience: totalYears(r),
    yearsAtPreviousWorkplaces: r.yearsPrevious,
    yearsAtEnosis: r.yearsEnosis,
    majorExpertise: r.majorExpertise,
    domains: r.domains,
    techStack: SKILL_CATEGORIES.map((c) => ({ category: c.label, items: r.skills.filter((s) => s.category === c.key).map((s) => s.name) })).filter((c) => c.items.length),
    education: r.education.map(({ degree, institution, year }) => ({ degree, institution, year })),
    achievementsAndCertifications: r.achievements.map(({ kind, name, issuer, year }) => ({ kind, name, issuer, year })),
    projects: r.projects.map((p) => ({
      name: p.name,
      type: p.type,
      industry: p.industry,
      brief: p.brief,
      features: p.features,
      role: p.role,
      duration: p.duration,
      teamSize: p.teamSize,
      technologies: p.technologies,
      contributions: p.contributions,
      outcomes: p.outcomes,
    })),
  };
}

export function requirementForAi(q: RequirementRow) {
  return {
    roleTitle: q.roleTitle,
    mustHaveSkills: q.mustHaveSkills,
    niceToHaveSkills: q.niceToHaveSkills,
    minimumYears: q.minYears,
    domain: q.domain,
    engagementType: q.engagementType,
    notes: q.notes,
  };
}

export function generationSystemPrompt(ai: AiSettings) {
  return `You write proposal-ready talent profiles for Enosis Solutions, a software services company. A prospect has sent a staffing requirement, and you tailor one engineer's profile to it. The profile is sent to the prospect, so accuracy matters more than polish: a single invented claim damages trust in every profile we send.

Hard rules:
1. Use only facts present in the resource record. Never invent or infer skills, projects, employers, numbers, durations, team sizes, certifications, awards, or results. Tailoring means selecting, ordering, and emphasizing what is there, and rewording it clearly.
2. If a must-have skill is not supported by the record, do not claim it anywhere in the profile, not even indirectly. List it in "gaps" instead. "gaps" is shown only to our sales team, never to the prospect.
3. Never name a client. Project titles describe the product (e.g. "Wi-Fi Spectrum Analysis Desktop Application"). If you need to describe a client, keep it generic (e.g. "a US-based healthcare SaaS company").
4. Keep numbers and measurable results exactly as written in the record.
5. Prefer concrete technical contributions over generic leadership or management language.
6. For each project, set "sourceProjectName" to the exact "name" of the record project you wrote it from.

Sections and limits:
- name and title: as in the record.
- careerSummary: one paragraph, at most ${ai.summaryMaxWords} words.
- coreCompetencies: ${ai.competenciesMin} to ${ai.competenciesMax} bullets, each at most ${ai.competencyMaxWords} words, each backed by evidence in the record.
- technicalExpertise: the record's tech stack grouped by category (Languages, Web Technologies, Frameworks, Libraries, Databases, Tools, Project Management, Cloud & Platforms). Put items relevant to the requirement first. Leave out empty categories. You may also include technologies that appear in the record's projects.
- education and awardsAndCertifications: from the record, full names.
- projects: the ${ai.projectsMin} to ${ai.projectsMax} most relevant projects (fewer only if the record has fewer). Each has a descriptive title, industry, a description of at most ${ai.projectDescriptionMaxWords} words, core technologies used in that project, and at most ${ai.contributionsMax} contribution bullets of at most ${ai.contributionMaxWords} words each.

House style guide:
${ai.styleGuide}`;
}

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Checks a generation against the limits and hard rules we can verify mechanically. Returns problems to fix. */
export function checkGeneration(out: GenerationOutput, record: ResourceInput, ai: AiSettings): string[] {
  const p = out.profile;
  const problems: string[] = [];
  if (words(p.careerSummary) > ai.summaryMaxWords) problems.push(`careerSummary has ${words(p.careerSummary)} words; the limit is ${ai.summaryMaxWords}.`);
  if (p.coreCompetencies.length < ai.competenciesMin || p.coreCompetencies.length > ai.competenciesMax)
    problems.push(`coreCompetencies has ${p.coreCompetencies.length} bullets; it needs ${ai.competenciesMin}-${ai.competenciesMax}.`);
  const maxProjects = Math.min(ai.projectsMax, record.projects.length);
  const minProjects = Math.min(ai.projectsMin, record.projects.length);
  if (p.projects.length < minProjects || p.projects.length > maxProjects) problems.push(`There are ${p.projects.length} projects; there should be ${minProjects}-${maxProjects}.`);
  const names = new Set(record.projects.map((x) => x.name.trim().toLowerCase()));
  for (const proj of p.projects) {
    if (!names.has(proj.sourceProjectName.trim().toLowerCase())) problems.push(`Project "${proj.title}" has sourceProjectName "${proj.sourceProjectName}", which is not a project name in the record.`);
    if (proj.contributions.length > ai.contributionsMax) problems.push(`Project "${proj.title}" has ${proj.contributions.length} contributions; the limit is ${ai.contributionsMax}.`);
    if (words(proj.description) > ai.projectDescriptionMaxWords) problems.push(`Project "${proj.title}" description is too long.`);
  }
  for (const client of record.projects.map((x) => x.clientName.trim()).filter((c) => c.length >= 3 && !/^enosis$/i.test(c))) {
    if (JSON.stringify(p).toLowerCase().includes(client.toLowerCase())) problems.push(`The client name "${client}" appears in the profile. Remove it.`);
  }
  return problems;
}

export type Generated = { content: ProfileContent; gaps: string[]; source: "ai" | "offline"; callId?: string; problems: string[] };

/**
 * Writes a tailored profile with Claude. Invalid or rule-breaking output is retried with the
 * problems listed; whatever still fails after the last attempt is returned so it can be flagged.
 */
export async function generateProfile(db: Db, requirement: RequirementRow, resource: ResourceRow, ai: AiSettings, adminEmail: string, staleAfterDays: number): Promise<Generated | { error: string }> {
  const record = toInput(resource);
  const missingMust = scoreResource(requirement, resource, staleAfterDays).missingMust;
  if (env.aiMode === "offline") return { ...offlineDraft(record, requirement, ai), gaps: missingMust };

  const system = generationSystemPrompt(ai);
  const base = `<requirement>\n${JSON.stringify(requirementForAi(requirement), null, 2)}\n</requirement>\n\n<resource_record>\n${JSON.stringify(recordForAi(record), null, 2)}\n</resource_record>\n\nWrite the tailored profile for this requirement using only the resource record.`;
  let problems: string[] = [];
  let last: { out: GenerationOutput; callId: string } | null = null;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const user = problems.length ? `${base}\n\nA previous draft had these problems. Avoid them:\n${problems.map((x) => `- ${x}`).join("\n")}` : base;
    const result = await callStructured(
      db,
      { purpose: "generate", requirementId: requirement.id, resourceId: resource.id, resourceUpdatedAt: resource.updatedAt, adminEmail, attempt },
      generationOutputSchema,
      system,
      user,
    );
    if (!result.ok) {
      lastError = result.error;
      // Configuration and refusal errors won't fix themselves on retry.
      if (!/format|cut off/.test(result.error)) break;
      continue;
    }
    last = { out: result.data, callId: result.callId };
    problems = checkGeneration(result.data, record, ai);
    if (problems.length === 0) break;
  }

  if (!last) return { error: lastError || "Generation failed." };
  const gaps = [...new Set([...last.out.gaps, ...missingMust])];
  return { content: last.out.profile, gaps, source: "ai", callId: last.callId, problems };
}

// ---- Offline draft (no API key) --------------------------------------------------

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => (w.length > 3 || /^[A-Z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w));
}

function firstSentences(text: string, n: number) {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).slice(0, n).map((s) => s.trim()).filter(Boolean);
}

/** A plain draft assembled from the record without AI, so the workflow can be tried without an API key. */
export function offlineDraft(record: ResourceInput, req: RequirementRow, ai: AiSettings): Omit<Generated, "gaps"> {
  const wanted = new Set([...req.mustHaveSkills, ...req.niceToHaveSkills].map(skillKey));
  const relevance = (techs: string[]) => techs.filter((t) => wanted.has(skillKey(t))).length;
  const years = totalYears(record);
  const expertise = firstSentences(record.majorExpertise, 2);

  const technicalExpertise = SKILL_CATEGORIES.map((c) => {
    const items = record.skills.filter((s) => s.category === c.key).map((s) => s.name);
    items.sort((a, b) => Number(wanted.has(skillKey(b))) - Number(wanted.has(skillKey(a))));
    return { category: categoryLabel(c.key), items };
  }).filter((c) => c.items.length);

  const projects = [...record.projects]
    .sort((a, b) => relevance(b.technologies) - relevance(a.technologies))
    .slice(0, ai.projectsMax)
    .map((p) => ({
      title: titleCase(p.name),
      industry: p.industry,
      description: [p.brief, p.features].filter(Boolean).join(" ").split(/\s+/).slice(0, ai.projectDescriptionMaxWords).join(" "),
      coreTechnologies: p.technologies,
      contributions: p.contributions.slice(0, ai.contributionsMax),
      sourceProjectName: p.name,
    }));

  const topSkills = technicalExpertise.flatMap((c) => c.items).filter((s) => wanted.has(skillKey(s))).slice(0, 5);
  const coreCompetencies = [
    ...expertise,
    topSkills.length ? `Hands-on experience with ${topSkills.join(", ")}.` : "",
    ...record.achievements.slice(0, 1).map((a) => `Recognized for: ${a.name}.`),
  ]
    .filter(Boolean)
    .slice(0, ai.competenciesMax);

  return {
    source: "offline",
    problems: [],
    content: {
      name: record.name,
      title: record.title,
      careerSummary: [`${record.title || "Software professional"}${years != null ? ` with ${years}+ years of experience` : ""}.`, ...expertise.slice(0, 1)].join(" "),
      coreCompetencies,
      technicalExpertise,
      education: record.education.map(({ degree, institution, year }) => ({ degree, institution, year })),
      awardsAndCertifications: record.achievements.map((a) => a.name),
      projects,
    },
  };
}
