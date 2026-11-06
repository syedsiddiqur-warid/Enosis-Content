import {
  ACHIEVEMENT_KINDS,
  AVAILABILITY_STATUSES,
  EDUCATION_LEVELS,
  categoryLabel,
  type Achievement,
  type Education,
  type Project,
  type ResourceInput,
  type Section,
  type Skill,
} from "./types";

export type FieldChange = { label: string; before: string; after: string };
export type ItemChange = { kind: "added" | "removed" | "changed"; label: string; fields: FieldChange[] };
export type SectionDiff = { section: Section; title: string; fields: FieldChange[]; items: ItemChange[] };

export const SECTION_TITLES: Record<Section, string> = {
  personal: "Personal details",
  experience: "Experience and expertise",
  skills: "Tech stack",
  education: "Education",
  achievements: "Achievements and certifications",
  projects: "Projects",
};

const str = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

function fieldChanges<T>(before: T, after: T, fields: [keyof T, string, ((v: unknown) => string)?][]): FieldChange[] {
  return fields.flatMap(([key, label, fmt = str]) => {
    const b = fmt(before[key]);
    const a = fmt(after[key]);
    return b === a ? [] : [{ label, before: b, after: a }];
  });
}

/** Matches list items by a key and reports added, removed, and changed items. */
function listChanges<T>(before: T[], after: T[], key: (t: T) => string, label: (t: T) => string, fields: [keyof T, string, ((v: unknown) => string)?][]): ItemChange[] {
  const beforeMap = new Map(before.map((t) => [key(t), t]));
  const afterMap = new Map(after.map((t) => [key(t), t]));
  const out: ItemChange[] = [];
  for (const [k, a] of afterMap) {
    const b = beforeMap.get(k);
    if (!b) out.push({ kind: "added", label: label(a), fields: [] });
    else {
      const changes = fieldChanges(b, a, fields);
      if (changes.length) out.push({ kind: "changed", label: label(a), fields: changes });
    }
  }
  for (const [k, b] of beforeMap) if (!afterMap.has(k)) out.push({ kind: "removed", label: label(b), fields: [] });
  return out;
}

const norm = (s: string) => s.trim().toLowerCase();
const tags = (before: string[], after: string[], what: string) =>
  listChanges(before, after, norm, (t) => `${what}: ${t}`, []);

const label = <T extends { key: string; label: string }>(list: readonly T[]) => (v: unknown) => list.find((x) => x.key === v)?.label ?? str(v);

/** Human-readable differences between two versions of a resource, grouped by section. */
export function diffResources(before: ResourceInput, after: ResourceInput): SectionDiff[] {
  const sections: SectionDiff[] = [
    {
      section: "personal",
      title: SECTION_TITLES.personal,
      fields: fieldChanges(before, after, [
        ["name", "Name"],
        ["title", "Title"],
        ["email", "Email"],
        ["seniority", "Seniority"],
      ]),
      items: [],
    },
    {
      section: "experience",
      title: SECTION_TITLES.experience,
      fields: fieldChanges(before, after, [
        ["yearsPrevious", "Years at previous workplaces"],
        ["yearsEnosis", "Years at Enosis"],
        ["availabilityStatus", "Availability", label(AVAILABILITY_STATUSES)],
        ["availableFrom", "Available from"],
        ["majorExpertise", "Major expertise"],
      ]),
      items: [...tags(before.domains, after.domains, "Domain"), ...tags(before.languages, after.languages, "Language")],
    },
    {
      section: "skills",
      title: SECTION_TITLES.skills,
      fields: [],
      items: listChanges<Skill>(before.skills, after.skills, (s) => `${s.category}:${norm(s.name)}`, (s) => `${s.name} (${categoryLabel(s.category)})`, [
        ["proficiency", "Proficiency"],
        ["years", "Years"],
      ]),
    },
    {
      section: "education",
      title: SECTION_TITLES.education,
      fields: [],
      items: listChanges<Education>(
        before.education,
        after.education,
        (e) => `${e.level}:${norm(e.degree)}`,
        (e) => e.degree || (EDUCATION_LEVELS.find((l) => l.key === e.level)?.label ?? e.level),
        [
          ["institution", "Institution"],
          ["year", "Year"],
        ],
      ),
    },
    {
      section: "achievements",
      title: SECTION_TITLES.achievements,
      fields: [],
      items: listChanges<Achievement>(before.achievements, after.achievements, (a) => norm(a.name), (a) => a.name, [
        ["kind", "Type", label(ACHIEVEMENT_KINDS)],
        ["issuer", "Issuer"],
        ["year", "Year"],
        ["credentialUrl", "Credential link"],
      ]),
    },
    {
      section: "projects",
      title: SECTION_TITLES.projects,
      fields: [],
      items: listChanges<Project>(before.projects, after.projects, (p) => norm(p.name), (p) => p.name, [
        ["type", "Type"],
        ["industry", "Industry"],
        ["clientName", "Client (internal)"],
        ["atEnosis", "Done at Enosis"],
        ["role", "Role"],
        ["duration", "Duration"],
        ["teamSize", "Team size"],
        ["brief", "Brief"],
        ["features", "Key features"],
        ["technologies", "Core technologies"],
        ["contributions", "Responsibilities and contributions", (v) => (Array.isArray(v) ? v.map((c) => `• ${c}`).join("\n") : str(v))],
        ["outcomes", "Measurable outcomes"],
      ]),
    },
  ];
  return sections.filter((s) => s.fields.length || s.items.length);
}
