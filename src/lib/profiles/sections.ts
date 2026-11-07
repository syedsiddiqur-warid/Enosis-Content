import type { ProfileContent, ProfileProject } from "./types";

/**
 * A profile split into the parts a reviewer can edit or comment on.
 * Keys: "header", "summary", "competencies", "expertise", "education", "awards", "project:<index>".
 */
export type SectionKey = string;

export function sectionKeys(c: ProfileContent): SectionKey[] {
  return ["header", "summary", "competencies", "expertise", "education", "awards", ...c.projects.map((_, i) => `project:${i}`)];
}

export function sectionLabel(c: ProfileContent, key: SectionKey) {
  if (key.startsWith("project:")) return `Project: ${c.projects[Number(key.slice(8))]?.title ?? "(removed)"}`;
  return { header: "Name and title", summary: "Career summary", competencies: "Core competency", expertise: "Technical expertise", education: "Education", awards: "Awards & certifications" }[key] ?? key;
}

export function getSection(c: ProfileContent, key: SectionKey): unknown {
  switch (key) {
    case "header":
      return { name: c.name, title: c.title };
    case "summary":
      return c.careerSummary;
    case "competencies":
      return c.coreCompetencies;
    case "expertise":
      return c.technicalExpertise;
    case "education":
      return c.education;
    case "awards":
      return c.awardsAndCertifications;
    default:
      return c.projects[Number(key.slice(8))];
  }
}

/** Returns a copy of the profile with one section replaced. Unknown keys leave it unchanged. */
export function setSection(c: ProfileContent, key: SectionKey, value: unknown): ProfileContent {
  const next = structuredClone(c);
  switch (key) {
    case "header": {
      const v = value as { name: string; title: string };
      next.name = v.name;
      next.title = v.title;
      break;
    }
    case "summary":
      next.careerSummary = value as string;
      break;
    case "competencies":
      next.coreCompetencies = value as string[];
      break;
    case "expertise":
      next.technicalExpertise = value as ProfileContent["technicalExpertise"];
      break;
    case "education":
      next.education = value as ProfileContent["education"];
      break;
    case "awards":
      next.awardsAndCertifications = value as string[];
      break;
    default: {
      const i = Number(key.slice(8));
      if (key.startsWith("project:") && next.projects[i]) next.projects[i] = { ...next.projects[i], ...(value as Partial<ProfileProject>) };
    }
  }
  return next;
}

/** Human-readable text of a section, for diffs and the side panel. Lists become one line per item. */
export function sectionText(c: ProfileContent, key: SectionKey): string {
  const v = getSection(c, key);
  switch (key) {
    case "header":
      return `${c.name}\n${c.title}`;
    case "summary":
      return c.careerSummary;
    case "competencies":
    case "awards":
      return (v as string[]).join("\n");
    case "expertise":
      return c.technicalExpertise.map((r) => `${r.category}: ${r.items.join(", ")}`).join("\n");
    case "education":
      return c.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(", ")).join("\n");
    default: {
      const p = v as ProfileProject | undefined;
      if (!p) return "";
      return [p.title, p.industry && `Industry: ${p.industry}`, p.description, `Core Technologies: ${p.coreTechnologies.join(", ")}`, ...p.contributions].filter(Boolean).join("\n");
    }
  }
}

export type VersionDiff = { key: string; title: string; fields: { label: string; before: string; after: string }[]; items: [] };

/** Section-by-section differences between two profile versions, in the shape ChangeList renders. */
export function diffProfiles(a: ProfileContent, b: ProfileContent): VersionDiff[] {
  const keys = [...new Set([...sectionKeys(a), ...sectionKeys(b)])];
  return keys.flatMap((key) => {
    const before = key.startsWith("project:") && !a.projects[Number(key.slice(8))] ? "" : sectionText(a, key);
    const after = key.startsWith("project:") && !b.projects[Number(key.slice(8))] ? "" : sectionText(b, key);
    if (before === after) return [];
    const title = sectionLabel(after ? b : a, key);
    return [{ key, title, fields: [{ label: "Text", before, after }], items: [] }];
  });
}
