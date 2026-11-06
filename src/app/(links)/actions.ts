"use server";

import { cookies } from "next/headers";
import { getDb } from "@/db";
import { otpCookieName, requestStatus, resolveToken, sendOtp, verifyOtp } from "@/lib/links/service";
import { visitMeta } from "@/lib/links/visit";

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
