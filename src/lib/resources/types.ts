import { z } from "zod";

/** Tech stack categories, matching our Google Form and the profile's Technical Expertise table. */
export const SKILL_CATEGORIES = [
  { key: "languages", label: "Languages" },
  { key: "web", label: "Web Technologies" },
  { key: "frameworks", label: "Frameworks" },
  { key: "libraries", label: "Libraries" },
  { key: "databases", label: "Databases" },
  { key: "tools", label: "Tools" },
  { key: "project_management", label: "Project Management" },
  { key: "cloud", label: "Cloud & Platforms" },
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]["key"];
const skillCategoryKeys = SKILL_CATEGORIES.map((c) => c.key) as [SkillCategory, ...SkillCategory[]];

export const PROFICIENCY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const SENIORITY_LEVELS = ["Intern", "Junior", "Mid", "Senior", "Lead", "Principal"] as const;
export const AVAILABILITY_STATUSES = [
  { key: "available", label: "Available" },
  { key: "partially_available", label: "Partially available" },
  { key: "allocated", label: "Allocated" },
  { key: "unknown", label: "Unknown" },
] as const;
export const ACHIEVEMENT_KINDS = [
  { key: "certification", label: "Certification" },
  { key: "award", label: "Award / competition" },
  { key: "publication", label: "Publication" },
  { key: "other", label: "Other" },
] as const;
export const EDUCATION_LEVELS = [
  { key: "bachelor", label: "Bachelor's" },
  { key: "master", label: "Master's" },
  { key: "phd", label: "PhD" },
  { key: "other", label: "Other" },
] as const;

const trimmed = z.string().trim();
const optionalText = trimmed.max(5000).default("");
const optionalYears = z.number().min(0).max(60).nullable().default(null);

export const skillSchema = z.object({
  category: z.enum(skillCategoryKeys),
  name: trimmed.min(1).max(100),
  proficiency: z.enum(PROFICIENCY_LEVELS).nullable().default(null),
  years: optionalYears,
});

export const educationSchema = z.object({
  level: z.enum(["bachelor", "master", "phd", "other"]),
  degree: optionalText,
  institution: optionalText,
  year: trimmed.max(50).default(""),
});

export const achievementSchema = z.object({
  kind: z.enum(["certification", "award", "publication", "other"]),
  name: trimmed.min(1).max(1000),
  issuer: trimmed.max(200).default(""),
  year: trimmed.max(20).default(""),
  credentialUrl: trimmed.max(500).default(""),
});

export const projectSchema = z.object({
  name: trimmed.min(1).max(300),
  type: trimmed.max(100).default(""),
  brief: optionalText,
  features: optionalText,
  // Internal only; never shown in generated profiles.
  clientName: trimmed.max(200).default(""),
  atEnosis: z.boolean().default(true),
  industry: trimmed.max(200).default(""),
  duration: trimmed.max(100).default(""),
  teamSize: trimmed.max(50).default(""),
  role: trimmed.max(200).default(""),
  technologies: z.array(trimmed.min(1).max(100)).default([]),
  contributions: z.array(trimmed.min(1).max(2000)).default([]),
  outcomes: optionalText,
});

export const resourceInputSchema = z.object({
  name: trimmed.min(1, "Name is required").max(200),
  email: z.email("Enter a valid email").transform((v) => v.trim().toLowerCase()),
  emailVerified: z.boolean().default(false),
  title: trimmed.max(200).default(""),
  seniority: trimmed.max(50).default(""),
  yearsPrevious: optionalYears,
  yearsEnosis: optionalYears,
  availabilityStatus: z.enum(["available", "partially_available", "allocated", "unknown"]).default("unknown"),
  availableFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  majorExpertise: optionalText,
  domains: z.array(trimmed.min(1).max(100)).default([]),
  languages: z.array(trimmed.min(1).max(100)).default([]),
  skills: z.array(skillSchema).default([]),
  education: z.array(educationSchema).default([]),
  achievements: z.array(achievementSchema).default([]),
  projects: z.array(projectSchema).default([]),
});

export type Skill = z.infer<typeof skillSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ResourceInput = z.infer<typeof resourceInputSchema>;

export const SECTIONS = ["personal", "experience", "skills", "education", "achievements", "projects"] as const;
export type Section = (typeof SECTIONS)[number];
export type SectionUpdates = Partial<Record<Section, { at: string; by: "admin" | "resource" | "import" }>>;

export function totalYears(r: { yearsPrevious: number | null; yearsEnosis: number | null }) {
  if (r.yearsPrevious == null && r.yearsEnosis == null) return null;
  return Math.round(((r.yearsPrevious ?? 0) + (r.yearsEnosis ?? 0)) * 10) / 10;
}

export function categoryLabel(key: string) {
  return SKILL_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
