import type { ProfileContent } from "@/lib/profiles/types";

/** Profile values that can fill a Canva brand template's text fields. */
export const MAX_PROJECT_FIELDS = 4;

const bullets = (items: string[]) => items.map((i) => `• ${i}`).join("\n");

function projectText(p: ProfileContent["projects"][number]) {
  return [p.title.toUpperCase(), p.industry && `Industry: ${p.industry}`, p.description, p.coreTechnologies.length ? `Core Technologies: ${p.coreTechnologies.join(", ")}` : "", p.contributions.length ? `Major Contributions:\n${bullets(p.contributions)}` : ""]
    .filter(Boolean)
    .join("\n");
}

export const PROFILE_FIELDS: { key: string; label: string; value: (c: ProfileContent) => string }[] = [
  { key: "name", label: "Name", value: (c) => c.name },
  { key: "name_upper", label: "Name (UPPERCASE)", value: (c) => c.name.toUpperCase() },
  { key: "title", label: "Title", value: (c) => c.title },
  { key: "careerSummary", label: "Career summary", value: (c) => c.careerSummary },
  { key: "coreCompetencies", label: "Core competency (bullets)", value: (c) => bullets(c.coreCompetencies) },
  { key: "technicalExpertise", label: "Technical expertise (one category per line)", value: (c) => c.technicalExpertise.map((r) => `${r.category}: ${r.items.join(", ")}`).join("\n") },
  { key: "technicalCategories", label: "Technical expertise: category names (one per line)", value: (c) => c.technicalExpertise.map((r) => r.category).join("\n") },
  { key: "technicalItems", label: "Technical expertise: items (one line per category)", value: (c) => c.technicalExpertise.map((r) => r.items.join(", ")).join("\n") },
  { key: "education", label: "Education (one per line)", value: (c) => c.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(", ")).join("\n") },
  { key: "awards", label: "Awards & certifications (bullets)", value: (c) => bullets(c.awardsAndCertifications) },
  { key: "projectsAll", label: "All projects (one text block)", value: (c) => c.projects.map(projectText).join("\n\n") },
  ...Array.from({ length: MAX_PROJECT_FIELDS }, (_, i) => [
    { key: `project${i + 1}.title`, label: `Project ${i + 1}: title`, value: (c: ProfileContent) => (c.projects[i]?.title ?? "").toUpperCase() },
    { key: `project${i + 1}.industry`, label: `Project ${i + 1}: industry`, value: (c: ProfileContent) => c.projects[i]?.industry ?? "" },
    { key: `project${i + 1}.description`, label: `Project ${i + 1}: description`, value: (c: ProfileContent) => c.projects[i]?.description ?? "" },
    { key: `project${i + 1}.technologies`, label: `Project ${i + 1}: core technologies`, value: (c: ProfileContent) => (c.projects[i]?.coreTechnologies ?? []).join(", ") },
    { key: `project${i + 1}.contributions`, label: `Project ${i + 1}: contributions (bullets)`, value: (c: ProfileContent) => bullets(c.projects[i]?.contributions ?? []) },
    { key: `project${i + 1}.full`, label: `Project ${i + 1}: everything (one block)`, value: (c: ProfileContent) => (c.projects[i] ? projectText(c.projects[i]) : "") },
  ]).flat(),
  { key: "website", label: "www.enosisbd.com", value: () => "www.enosisbd.com" },
];

/** Guesses a profile field for a Canva field name ("career_summary" → careerSummary). */
export function guessField(canvaField: string) {
  const n = canvaField.toLowerCase().replace(/[^a-z0-9]/g, "");
  const project = n.match(/project(\d)(title|name|industry|description|desc|tech|technologies|contributions|bullets)?/);
  if (project && Number(project[1]) <= MAX_PROJECT_FIELDS) {
    const part = { name: "title", title: "title", industry: "industry", description: "description", desc: "description", tech: "technologies", technologies: "technologies", contributions: "contributions", bullets: "contributions" }[project[2] ?? ""] ?? "full";
    return `project${project[1]}.${part}`;
  }
  const map: [RegExp, string][] = [
    [/^(full)?name$/, "name"],
    [/(job)?title|designation|role/, "title"],
    [/summary/, "careerSummary"],
    [/competenc/, "coreCompetencies"],
    [/expertise|techstack|skills/, "technicalExpertise"],
    [/education|degree/, "education"],
    [/award|certif/, "awards"],
    [/projects?$|engagements/, "projectsAll"],
    [/website|url|footer/, "website"],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? "";
}
