"use server";

import { cookies } from "next/headers";
import { getDb } from "@/db";
import { otpCookieName, requestStatus, resolveToken, sendOtp, verifyOtp } from "@/lib/links/service";
import { saveDraft, submitUpdate, type SubmitResult } from "@/lib/links/update";
import { authorizeLink, visitMeta } from "@/lib/links/visit";

export type OtpState = { sentTo?: string; error?: string; verified?: boolean } | null;

/** Handles both steps of the optional email-code check: "send" and "verify". */
export async function otpAction(prev: OtpState, formData: FormData): Promise<OtpState> {
  const token = String(formData.get("token") ?? "");
  const db = await getDb();
  const found = await resolveToken(db, token);
  if (!found || requestStatus(found.request) === "expired" || found.request.revokedAt || found.request.completedAt) {
    return { error: "This link is no longer active." };
  }
  const meta = await visitMeta();

  if (formData.get("step") === "send") {
    return { sentTo: await sendOtp(db, found.request, meta) };
  }

  const result = await verifyOtp(db, found.request, String(formData.get("code") ?? ""), meta);
  if (!result.ok) return { sentTo: prev?.sentTo, error: result.error };
  (await cookies()).set(otpCookieName(found.request.id), result.session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: found.request.expiresAt,
  });
  return { verified: true };
}

const MAX_PAYLOAD = 400_000;
const CLOSED = "This link is no longer active. If you still need to make changes, please reply to our email and we'll send a new link.";

/** Autosave for the resource update form. Returns when it was saved, or an error the form can show. */
export async function saveDraftAction(token: string, json: string): Promise<{ savedAt?: string; error?: string }> {
  if (json.length > MAX_PAYLOAD) return { error: "That's more text than we can save. Please shorten something." };
  const db = await getDb();
  const req = await authorizeLink(db, token, "resource_update");
  if (!req) return { error: CLOSED };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: "Couldn't save your changes. Please try again." };
  }
  const savedAt = await saveDraft(db, req, raw);
  return savedAt ? { savedAt: savedAt.toISOString() } : { error: "Couldn't save your changes. Please try again." };
}

export async function submitUpdateAction(token: string, json: string): Promise<SubmitResult> {
  if (json.length > MAX_PAYLOAD) return { ok: false, errors: ["That's more text than we can save. Please shorten something."] };
  const db = await getDb();
  const req = await authorizeLink(db, token, "resource_update");
  if (!req) return { ok: false, errors: [CLOSED] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["Couldn't read your form. Please try again."] };
  }
  return submitUpdate(db, req, raw, await visitMeta());
}
