"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ProfileError, generateForCandidate, getProfile, recheckProfile, saveEditedProfile } from "@/lib/profiles/service";
import { ReviewError, reopenProfile, runRevision, sendForReview } from "@/lib/reviews/service";
import { eq } from "drizzle-orm";
import { requirements } from "@/db/schema";
import { exportProfile } from "@/lib/export";

const uuid = z.uuid();

/** Bound to (requirementId, resourceId). Claude calls can take up to a minute or two. */
export async function generateProfileAction(requirementId: string, resourceId: string) {
  const session = await requireAdmin();
  let profileId: string;
  try {
    profileId = await generateForCandidate(await getDb(), uuid.parse(requirementId), uuid.parse(resourceId), session.email);
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    redirect(`/admin/requirements/${requirementId}?notice=${encodeURIComponent(`Couldn't generate the profile: ${err.message}`)}`);
  }
  revalidatePath(`/admin/requirements/${requirementId}`);
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent("New version generated and fact-checked.")}`);
}

export async function regenerateProfileAction(profileId: string) {
  const session = await requireAdmin();
  const db = await getDb();
  const current = await getProfile(db, uuid.parse(profileId));
  if (!current) redirect("/admin/requirements");
  let notice = "New version generated and fact-checked.";
  try {
    await generateForCandidate(db, current.profile.requirementId, current.profile.resourceId, session.email);
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    notice = `Couldn't regenerate: ${err.message}`;
  }
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(notice)}`);
}

export async function recheckProfileAction(profileId: string) {
  const session = await requireAdmin();
  let notice = "Fact check finished.";
  try {
    await recheckProfile(await getDb(), uuid.parse(profileId), session.email);
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    notice = err.message;
  }
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(notice)}`);
}

export type EditState = { error?: string } | null;

export async function saveProfileEditAction(_prev: EditState, formData: FormData): Promise<EditState> {
  const session = await requireAdmin();
  const profileId = uuid.parse(formData.get("profileId"));
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Could not read the form. Please try again." };
  }
  try {
    await saveEditedProfile(await getDb(), profileId, payload, session.email);
  } catch (err) {
    if (err instanceof ProfileError) return { error: err.message };
    throw err;
  }
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent("Saved as a new version. Rule-based checks re-ran.")}`);
}

/** Copies an older version forward as the newest one. */
export async function restoreVersionAction(profileId: string, version: number) {
  const session = await requireAdmin();
  const db = await getDb();
  const old = await getProfile(db, uuid.parse(profileId), version);
  if (!old?.version) redirect(`/admin/profiles/${profileId}`);
  let notice = `Version ${version} restored as a new version.`;
  try {
    await saveEditedProfile(db, profileId, old.version.content, session.email);
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    notice = err.message;
  }
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(notice)}`);
}

export type ReviewFormState = { error?: string } | null;

export async function sendForReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const session = await requireAdmin();
  const profileId = uuid.parse(formData.get("profileId"));
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < new Date().toISOString().slice(0, 10)) return { error: "Choose a due date that isn't in the past." };
  if (formData.get("hasHighFlags") === "1" && formData.get("ackFlags") !== "on") return { error: "Please confirm you've checked the high-severity fact-check flags." };

  let newReviewer: { name: string; email: string } | undefined;
  if (reviewerId === "new") {
    const parsed = z.object({ name: z.string().trim().min(1, "Enter the reviewer's name."), email: z.email("Enter a valid email.") }).safeParse({
      name: formData.get("newName"),
      email: String(formData.get("newEmail") ?? "").trim(),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    newReviewer = parsed.data;
  } else if (!uuid.safeParse(reviewerId).success) return { error: "Choose a reviewer." };

  let notice: string;
  try {
    const sent = await sendForReview(await getDb(), { profileId, reviewerId: reviewerId === "new" ? undefined : reviewerId, newReviewer, dueDate }, session.email);
    notice = `Review round ${sent.round} sent to ${sent.reviewer.name}${sent.emailStatus === "dev_inbox" ? " (dev inbox)" : sent.emailStatus === "sent" ? "" : ` (email ${sent.emailStatus})`}.`;
  } catch (err) {
    if (err instanceof ReviewError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/profiles/${profileId}`);
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(notice)}`);
}

export async function reopenProfileAction(profileId: string) {
  await requireAdmin();
  await reopenProfile(await getDb(), uuid.parse(profileId));
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent("Reopened. You can edit it and send it for review again.")}`);
}

export async function retryRevisionAction(profileId: string, reviewId: string) {
  await requireAdmin();
  const db = await getDb();
  await runRevision(db, uuid.parse(reviewId));
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent("Revision attempted. See the review round for the result.")}`);
}

/** Exports the approved version: Canva (falls back to the in-app PDF if Canva fails) or the in-app PDF. */
export async function exportProfileAction(profileId: string, method: "html" | "canva") {
  const session = await requireAdmin();
  const db = await getDb();
  const data = await getProfile(db, uuid.parse(profileId));
  if (!data) redirect("/admin/requirements");
  if (data.profile.status !== "approved" && data.profile.status !== "exported") {
    redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent("Only approved profiles can be exported.")}`);
  }
  const [requirement] = await db.select().from(requirements).where(eq(requirements.id, data.profile.requirementId));
  let notice: string;
  try {
    const result = await exportProfile(db, profileId, method === "canva" ? "canva" : "html", session.email, requirement?.roleTitle ?? "");
    notice = result.fellBack ? `Canva export failed (${result.canvaError}). The in-app PDF was made instead.` : method === "canva" ? "Exported to Canva. The PDF is ready to download." : "PDF ready to download.";
  } catch (err) {
    notice = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  revalidatePath(`/admin/profiles/${profileId}`);
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(notice)}`);
}
