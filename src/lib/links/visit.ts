import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Db } from "@/db/client";
import type { AccessRequestRow } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { otpCookieName, recordOpen, recordVisit, requestStatus, resolveToken, type Purpose, type VisitMeta } from "./service";

export async function visitMeta(): Promise<VisitMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  return {
    ipHash: ip ? createHash("sha256").update(`${env.auditSalt}:${ip}`).digest("hex").slice(0, 16) : undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

type Access =
  | { state: "invalid" }
  | { state: "revoked" | "expired" | "completed" | "otp" | "open"; request: AccessRequestRow; tokenId: string };

/** Decides what a link holder may see, including the optional email-code check. Records nothing. */
export async function checkAccess(db: Db, token: string, purpose: Purpose): Promise<Access> {
  const found = await resolveToken(db, token);
  if (!found || found.request.purpose !== purpose) return { state: "invalid" };
  const { request, tokenId } = found;

  const status = requestStatus(request);
  if (status === "completed" || status === "revoked" || status === "expired") return { state: status, request, tokenId };

  const settings = await getSettings(db);
  if (settings.requireOtp) {
    const session = (await cookies()).get(otpCookieName(request.id))?.value;
    if (!session || !request.verifiedSessionHash || hashToken(session) !== request.verifiedSessionHash) return { state: "otp", request, tokenId };
  }
  return { state: "open", request, tokenId };
}

/** For server actions: the request if the link is open and verified, otherwise null. */
export async function authorizeLink(db: Db, token: string, purpose: Purpose) {
  const access = await checkAccess(db, token, purpose);
  return access.state === "open" ? access.request : null;
}

export type LinkView = { state: "invalid" } | { state: "revoked" | "expired" | "completed" | "otp" | "open"; request: AccessRequestRow };

/** Resolves a link for a public page and logs the visit. */
export async function openLink(db: Db, token: string, purpose: Purpose): Promise<LinkView> {
  const access = await checkAccess(db, token, purpose);
  if (access.state === "invalid") return access;
  const { request, tokenId, state } = access;
  if (state === "completed" || state === "revoked" || state === "expired") {
    await recordVisit(db, request, tokenId, `opened_${state}`, await visitMeta());
  } else if (state === "open") {
    await recordOpen(db, request, tokenId, await visitMeta());
  }
  return { state, request };
}
