import { z } from "zod";

/**
 * A tailored profile, section by section, matching our current client-facing format:
 * header, career summary, core competency, technical expertise, education,
 * awards & certifications, and project engagements.
 */
export const profileProjectSchema = z.object({
  title: z.string().describe("Descriptive product title, never a client name, e.g. 'Web-Based Event Management Platform'"),
  industry: z.string(),
  description: z.string(),
  coreTechnologies: z.array(z.string()),
  contributions: z.array(z.string()),
  sourceProjectName: z.string().describe("Exact name of the project in the resource record this was written from (internal, not shown)"),
});

export const profileContentSchema = z.object({
  name: z.string(),
  title: z.string(),
  careerSummary: z.string(),
  coreCompetencies: z.array(z.string()),
  technicalExpertise: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), year: z.string() })),
  awardsAndCertifications: z.array(z.string()),
  projects: z.array(profileProjectSchema),
});

/** What the model returns: the profile plus admin-only notes. */
export const generationOutputSchema = z.object({
  profile: profileContentSchema,
  gaps: z.array(z.string()).describe("Must-have skills or requirements NOT supported by the record. Admin-only; never in the profile."),
});

export const factCheckOutputSchema = z.object({
  flags: z.array(
    z.object({
      section: z.string(),
      quote: z.string().describe("The exact text from the profile"),
      issue: z.string().describe("Why it is not supported by the record"),
      severity: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export type ProfileContent = z.infer<typeof profileContentSchema>;
export type ProfileProject = z.infer<typeof profileProjectSchema>;
export type GenerationOutput = z.infer<typeof generationOutputSchema>;
export type FactFlag = z.infer<typeof factCheckOutputSchema>["flags"][number] & { source: "rules" | "ai" };
export type FactCheck = { flags: FactFlag[]; checkedAt: string; aiChecked: boolean; aiError?: string };

export const PROFILE_STATUSES = [
  { key: "generated", label: "Generated" },
  { key: "in_review", label: "In review" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "revised", label: "Revised" },
  { key: "approved", label: "Approved" },
  { key: "exported", label: "Exported" },
] as const;
