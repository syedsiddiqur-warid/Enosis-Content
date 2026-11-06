import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Db } from "@/db/client";
import { hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { otpCookieName, recordOpen, recordVisit, requestStatus, resolveToken, type VisitMeta } from "./service";

export async function visitMeta(): Promise<VisitMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  return {
    ipHash: ip ? createHash("sha256").update(`${env.auditSalt}:${ip}`).digest("hex").slice(0, 16) : undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

export type LinkView =
  | { state: "invalid" }
  | { state: "revoked" | "expired" | "completed" | "otp"; request: NonNullable<Awaited<ReturnType<typeof resolveToken>>>["request"] }
  | { state: "open"; request: NonNullable<Awaited<ReturnType<typeof resolveToken>>>["request"] };

/** Resolves a link for a public page and decides what to show. Logs the open when the task page is shown. */
export async function openLink(db: Db, token: string, purpose: "resource_update" | "profile_review"): Promise<LinkView> {
  const found = await resolveToken(db, token);
  if (!found || found.request.purpose !== purpose) return { state: "invalid" };
  const { request, tokenId } = found;

  const status = requestStatus(request);
  if (status === "completed" || status === "revoked" || status === "expired") {
    await recordVisit(db, request, tokenId, `opened_${status}`, await visitMeta());
    return { state: status, request };
  }

  const settings = await getSettings(db);
  if (settings.requireOtp) {
    const session = (await cookies()).get(otpCookieName(request.id))?.value;
    if (!session || !request.verifiedSessionHash || hashToken(session) !== request.verifiedSessionHash) return { state: "otp", request };
  }

  await recordOpen(db, request, tokenId, await visitMeta());
  return { state: "open", request };
}
