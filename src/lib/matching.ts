import type { RequirementRow, ResourceRow } from "@/db/schema";
import { totalYears } from "@/lib/resources/types";

/**
 * Ranks resources against a requirement. Pure and explainable: every point in the
 * score comes with a reason the admin can read. The admin always makes the final pick.
 */

// Common spellings that mean the same thing. Keys and values are lowercase.
const ALIASES: Record<string, string> = {
  js: "javascript",
  ecmascript: "javascript",
  ts: "typescript",
  postgres: "postgresql",
  psql: "postgresql",
  mssql: "sql server",
  "ms sql": "sql server",
  "microsoft sql server": "sql server",
  k8s: "kubernetes",
  golang: "go",
  "c sharp": "c#",
  csharp: "c#",
  dotnet: ".net",
  "dot net": ".net",
  "asp.net": "asp.net core",
  gcp: "google cloud platform",
  "google cloud": "google cloud platform",
  "amazon web services": "aws",
  ml: "machine learning",
  "react native": "react native",
  rn: "react native",
  "ef core": "entity framework core",
  efcore: "entity framework core",
  "entity framework": "entity framework core",
};

/** Canonical key: lowercase, alias-resolved, ".js"/"js" suffix and separators removed ("React.js" → "react"). */
export function skillKey(raw: string) {
  let s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  s = ALIASES[s] ?? s;
  if (s.length > 4) s = s.replace(/\.?js$/, "");
  s = ALIASES[s] ?? s;
  // Keep a leading dot (".net") and symbols that matter (c#, c++); drop other separators.
  return s.startsWith(".") ? s : s.replace(/[\s\-_.]/g, "");
}

function words(raw: string) {
  return raw
    .toLowerCase()
    .split(/[\s/,()]+/)
    .map((w) => skillKey(w))
    .filter(Boolean);
}

export type SkillMatch = { skill: string; strength: 1 | 0.6; via: string; projectCount: number };

type ResourceSkills = { name: string; key: string; words: string[] }[];

function resourceSkills(r: ResourceRow): ResourceSkills {
  const names = new Map<string, string>();
  for (const s of r.skills) names.set(skillKey(s.name), s.name);
  for (const p of r.projects) for (const t of p.technologies) if (!names.has(skillKey(t))) names.set(skillKey(t), t);
  return [...names].map(([key, name]) => ({ name, key, words: words(name) }));
}

/** Exact (after normalization) counts fully; a related skill ("AWS" ↔ "AWS Lambda") counts partly. */
function findSkill(required: string, have: ResourceSkills, r: ResourceRow): SkillMatch | null {
  const key = skillKey(required);
  const projectCount = r.projects.filter((p) => p.technologies.some((t) => skillKey(t) === key)).length;
  const exact = have.find((h) => h.key === key);
  if (exact) return { skill: required, strength: 1, via: exact.name, projectCount };
  const reqWords = words(required);
  const related = have.find((h) => reqWords.length > 0 && (reqWords.every((w) => h.words.includes(w)) || (h.words.length > 0 && h.words.every((w) => reqWords.includes(w)))));
  if (related) {
    const relCount = r.projects.filter((p) => p.technologies.some((t) => skillKey(t) === related.key)).length;
    return { skill: required, strength: 0.6, via: related.name, projectCount: relCount };
  }
  return null;
}

const AVAILABILITY_SCORE: Record<string, number> = { available: 1, partially_available: 0.6, unknown: 0.5, allocated: 0.2 };

export type ScorePart = { label: string; points: number; max: number; detail: string };
export type MatchResult = {
  resource: ResourceRow;
  score: number;
  parts: ScorePart[];
  matchedMust: SkillMatch[];
  missingMust: string[];
  matchedNice: SkillMatch[];
  missingNice: string[];
  years: number | null;
  stale: boolean;
  daysSinceUpdate: number;
  domainMatch: boolean | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function scoreResource(req: RequirementRow, r: ResourceRow, staleAfterDays: number, now = new Date()): MatchResult {
  const have = resourceSkills(r);
  const must = req.mustHaveSkills.map((s) => ({ s, m: findSkill(s, have, r) }));
  const nice = req.niceToHaveSkills.map((s) => ({ s, m: findSkill(s, have, r) }));
  const parts: ScorePart[] = [];

  if (must.length) {
    const got = must.reduce((n, x) => n + (x.m?.strength ?? 0), 0);
    parts.push({ label: "Must-have skills", points: (got / must.length) * 50, max: 50, detail: `${must.filter((x) => x.m).length} of ${must.length}` });
  }
  if (nice.length) {
    const got = nice.reduce((n, x) => n + (x.m?.strength ?? 0), 0);
    parts.push({ label: "Nice-to-have skills", points: (got / nice.length) * 15, max: 15, detail: `${nice.filter((x) => x.m).length} of ${nice.length}` });
  }

  const years = totalYears(r);
  if (req.minYears) {
    const ratio = years == null ? 0 : Math.min(1, years / req.minYears);
    parts.push({ label: "Experience", points: ratio * 15, max: 15, detail: years == null ? "unknown" : `${years} of ${req.minYears}+ yrs` });
  }

  let avail = AVAILABILITY_SCORE[r.availabilityStatus] ?? 0.5;
  let availDetail = r.availabilityStatus.replace("_", " ");
  if (r.availableFrom && req.deadline && r.availableFrom <= req.deadline && avail < 0.9) {
    avail = 0.9;
    availDetail = `free from ${r.availableFrom}`;
  }
  parts.push({ label: "Availability", points: avail * 10, max: 10, detail: availDetail });

  let domainMatch: boolean | null = null;
  if (req.domain.trim()) {
    const d = req.domain.trim().toLowerCase();
    const domains = [...r.domains, ...r.projects.map((p) => p.industry)].map((x) => x.toLowerCase());
    domainMatch = domains.some((x) => x && (x.includes(d) || d.includes(x)));
    parts.push({ label: "Domain", points: domainMatch ? 5 : 0, max: 5, detail: domainMatch ? req.domain : "no matching projects" });
  }

  const daysSinceUpdate = Math.floor((now.getTime() - r.updatedAt.getTime()) / DAY_MS);
  const stale = daysSinceUpdate > staleAfterDays;
  const fresh = daysSinceUpdate <= staleAfterDays ? 1 : Math.max(0, 1 - (daysSinceUpdate - staleAfterDays) / (2 * staleAfterDays));
  parts.push({ label: "Data freshness", points: fresh * 5, max: 5, detail: `updated ${daysSinceUpdate}d ago` });

  // Normalize over the parts that apply, so a requirement without (say) nice-to-haves still scores out of 100.
  const max = parts.reduce((n, p) => n + p.max, 0);
  const got = parts.reduce((n, p) => n + p.points, 0);
  return {
    resource: r,
    score: Math.round((got / max) * 100),
    parts,
    matchedMust: must.flatMap((x) => (x.m ? [x.m] : [])),
    missingMust: must.filter((x) => !x.m).map((x) => x.s),
    matchedNice: nice.flatMap((x) => (x.m ? [x.m] : [])),
    missingNice: nice.filter((x) => !x.m).map((x) => x.s),
    years,
    stale,
    daysSinceUpdate,
    domainMatch,
  };
}

export function rankResources(req: RequirementRow, resources: ResourceRow[], staleAfterDays: number) {
  return resources
    .filter((r) => !r.archivedAt)
    .map((r) => scoreResource(req, r, staleAfterDays))
    .sort((a, b) => b.score - a.score || b.matchedMust.length - a.matchedMust.length || a.resource.name.localeCompare(b.resource.name));
}

/** Skill names from our own data that appear in a job description, for one-click adding. */
export function findSkillsInText(text: string, vocabulary: string[]) {
  const lower = ` ${text.toLowerCase()} `;
  const seen = new Set<string>();
  const found: string[] = [];
  for (const name of [...vocabulary].sort((a, b) => b.length - a.length)) {
    const key = skillKey(name);
    if (seen.has(key) || name.length < 2) continue;
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#])`).test(lower)) {
      seen.add(key);
      found.push(name);
    }
  }
  return found;
}
