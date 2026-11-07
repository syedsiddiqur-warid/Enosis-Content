import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appSettings } from "@/db/schema";

export const settingsSchema = z.object({
  senderName: z.string().trim().min(1).max(100).default("Enosis Talent Team"),
  resourceLinkDays: z.number().int().min(1).max(60).default(7),
  reviewerLinkDays: z.number().int().min(1).max(60).default(3),
  reminderDaysBeforeDue: z.number().int().min(0).max(30).default(2),
  maxReminders: z.number().int().min(0).max(5).default(1),
  requireOtp: z.boolean().default(false),
  sendThankYouEmail: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;

/** All settings live in one row, so a partial or older stored value still gets defaults for new keys. */
const KEY = "general";

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY));
  const parsed = settingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function saveSettings(db: Db, value: Settings, by: string) {
  await saveRow(db, KEY, value, by);
}

async function saveRow(db: Db, key: string, value: unknown, by: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: by })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

// ---- AI writing settings (house style and section limits) ----

export const DEFAULT_STYLE_GUIDE = `- Write in the third person. Start bullets with a verb or noun, never a pronoun ("Designed the booking API", not "He designed…").
- Be specific and technical: name the technologies, what was built, and the result.
- Prefer concrete technical contributions over generic leadership or management language.
- Use past tense for finished work and present tense for ongoing work.
- Keep numbers and results exactly as the resource wrote them; never round up or add new ones.
- Project titles describe the product in title case (e.g. "Web-Based Event Management Platform"), never the client.
- Career summary: title and years of experience first, then core specialization, then one notable strength.
- Core competencies: each bullet states a strength and backs it with evidence from the record.
- Plain, confident, professional tone. No buzzwords ("rockstar", "ninja", "synergy").`;

export const aiSettingsSchema = z.object({
  styleGuide: z.string().max(10000).default(DEFAULT_STYLE_GUIDE),
  summaryMaxWords: z.number().int().min(20).max(300).default(70),
  competenciesMin: z.number().int().min(1).max(10).default(3),
  competenciesMax: z.number().int().min(1).max(10).default(5),
  competencyMaxWords: z.number().int().min(10).max(100).default(40),
  projectsMin: z.number().int().min(1).max(10).default(2),
  projectsMax: z.number().int().min(1).max(10).default(4),
  projectDescriptionMaxWords: z.number().int().min(20).max(300).default(90),
  contributionsMax: z.number().int().min(1).max(15).default(6),
  contributionMaxWords: z.number().int().min(5).max(80).default(30),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

const AI_KEY = "ai";

export async function getAiSettings(db: Db): Promise<AiSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, AI_KEY));
  const parsed = aiSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : aiSettingsSchema.parse({});
}

export async function saveAiSettings(db: Db, value: AiSettings, by: string) {
  await saveRow(db, AI_KEY, value, by);
}

// ---- Reminder job log: when the last reminder run happened and what it did ----

const REMINDER_RUN_KEY = "reminders:last_run";

export type LastReminderRun = { at: string; by: string; checked: number; sent: number; blocked: number; failed: number };

export async function getLastReminderRun(db: Db): Promise<LastReminderRun | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, REMINDER_RUN_KEY));
  return (row?.value as LastReminderRun | undefined) ?? null;
}

export async function saveLastReminderRun(db: Db, run: LastReminderRun) {
  await saveRow(db, REMINDER_RUN_KEY, run, run.by);
}
