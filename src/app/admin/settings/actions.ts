"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { resetTemplate, saveTemplate, TEMPLATE_DEFS, type TemplateKey } from "@/lib/notify/templates";
import { DEFAULT_STYLE_GUIDE, aiSettingsSchema, saveAiSettings, saveSettings, settingsSchema } from "@/lib/settings";

export type FormState = { error?: string } | null;

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    senderName: formData.get("senderName"),
    resourceLinkDays: Number(formData.get("resourceLinkDays")),
    reviewerLinkDays: Number(formData.get("reviewerLinkDays")),
    reminderDaysBeforeDue: Number(formData.get("reminderDaysBeforeDue")),
    maxReminders: Number(formData.get("maxReminders")),
    requireOtp: formData.get("requireOtp") === "on",
    sendThankYouEmail: formData.get("sendThankYouEmail") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  await saveSettings(await getDb(), parsed.data, session.email);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

const keySchema = z.enum(TEMPLATE_DEFS.map((t) => t.key) as [TemplateKey, ...TemplateKey[]]);

export async function saveTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const key = keySchema.parse(formData.get("key"));
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || !body) return { error: "Subject and message can't be empty." };
  if (subject.length > 300 || body.length > 10000) return { error: "The message is too long." };
  if (key !== "thank_you" && !body.includes("{link}")) return { error: "The message must include {link} so the recipient can open their page." };
  await saveTemplate(await getDb(), key, subject, body, session.email);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

export async function resetTemplateAction(formData: FormData) {
  await requireAdmin();
  const key = keySchema.parse(formData.get("key"));
  await resetTemplate(await getDb(), key);
  revalidatePath("/admin/settings");
  redirect(`/admin/settings/templates/${key}`);
}

export async function saveAiSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const num = (k: string) => Number(formData.get(k));
  const reset = formData.get("resetStyle") === "1";
  const parsed = aiSettingsSchema.safeParse({
    styleGuide: reset ? DEFAULT_STYLE_GUIDE : String(formData.get("styleGuide") ?? "").replace(/\r\n/g, "\n").trim(),
    summaryMaxWords: num("summaryMaxWords"),
    competenciesMin: num("competenciesMin"),
    competenciesMax: num("competenciesMax"),
    competencyMaxWords: num("competencyMaxWords"),
    projectsMin: num("projectsMin"),
    projectsMax: num("projectsMax"),
    projectDescriptionMaxWords: num("projectDescriptionMaxWords"),
    contributionsMax: num("contributionsMax"),
    contributionMaxWords: num("contributionMaxWords"),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (parsed.data.competenciesMin > parsed.data.competenciesMax || parsed.data.projectsMin > parsed.data.projectsMax) return { error: "A minimum can't be larger than its maximum." };
  await saveAiSettings(await getDb(), parsed.data, session.email);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1#ai");
}
