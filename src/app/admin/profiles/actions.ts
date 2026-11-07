"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ProfileError, generateForCandidate, getProfile, recheckProfile, saveEditedProfile } from "@/lib/profiles/service";

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
  await saveEditedProfile(db, profileId, old.version.content, session.email);
  redirect(`/admin/profiles/${profileId}?notice=${encodeURIComponent(`Version ${version} restored as a new version.`)}`);
}
