import { z } from "zod";

// Client-safe requirement definitions (no database imports).

export const ENGAGEMENT_TYPES = ["Dedicated team member", "Staff augmentation", "Fixed-scope project", "Part-time", "Consulting", "Other"] as const;
export const REQUIREMENT_STATUSES = [
  { key: "open", label: "Open" },
  { key: "submitted", label: "Proposal sent" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "closed", label: "Closed" },
] as const;

const skillList = z.array(z.string().trim().min(1).max(100)).max(50).default([]);

export const requirementInputSchema = z.object({
  clientName: z.string().trim().min(1, "Client or prospect name is required").max(200),
  roleTitle: z.string().trim().min(1, "Role title is required").max(200),
  mustHaveSkills: skillList,
  niceToHaveSkills: skillList,
  minYears: z.number().min(0).max(40).nullable().default(null),
  domain: z.string().trim().max(200).default(""),
  engagementType: z.string().trim().max(100).default(""),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: z.string().trim().max(20000).default(""),
  status: z.enum(["open", "submitted", "won", "lost", "closed"]).default("open"),
});
export type RequirementInput = z.infer<typeof requirementInputSchema>;
