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
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedBy: by })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}
