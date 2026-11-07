import "server-only";
import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accessEvents, accessRequests, accessTokens, resources, type AccessRequestRow, type ResourceRow } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/crypto";
import { sendEmail, type SendResult } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { fill, getTemplate, toHtml, type TemplateKey } from "@/lib/notify/templates";
import { getSettings } from "@/lib/settings";
import { baseUrl } from "@/lib/url";

const DAY_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export type Purpose = "resource_update" | "profile_review";
export type RequestStatus = "completed" | "revoked" | "expired" | "opened" | "sent";
export type VisitMeta = { ipHash?: string; userAgent?: string };

export class LinkError extends Error {}

export function requestStatus(r: Pick<AccessRequestRow, "completedAt" | "revokedAt" | "expiresAt" | "openCount">, now = new Date()): RequestStatus {
  if (r.completedAt) return "completed";
  if (r.revokedAt) return "revoked";
  if (r.expiresAt <= now) return "expired";
  return r.openCount > 0 ? "opened" : "sent";
}

export function isActive(r: AccessRequestRow) {
  return !r.completedAt && !r.revokedAt && r.expiresAt > new Date();
}

function linkPath(purpose: string, token: string) {
  return purpose === "profile_review" ? `/review/${token}` : `/r/${token}`;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "2026-11-12" → "Thursday, 12 November 2026" */
export function formatDueDate(date: string | null) {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function addDaysIso(days: number, from = new Date()) {
  return new Date(from.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

async function logEvent(db: Db, requestId: string, type: string, extra: { tokenId?: string; detail?: string; actor?: string | null } & VisitMeta = {}) {
  await db.insert(accessEvents).values({
    requestId,
    type,
    tokenId: extra.tokenId,
    detail: extra.detail,
    actor: extra.actor ?? null,
    ipHash: extra.ipHash,
    userAgent: extra.userAgent?.slice(0, 300),
  });
}

async function issueToken(db: Db, requestId: string, reason: "initial" | "resend" | "reminder") {
  const token = randomToken();
  await db.insert(accessTokens).values({ requestId, tokenHash: hashToken(token), reason });
  return token;
}

function emailIsSendable(r: Pick<ResourceRow, "emailVerified">) {
  return env.emailProvider === "dev" || r.emailVerified;
}

/** Renders a template for a request and sends it. Logs the result as an event. */
async function sendTemplated(db: Db, req: AccessRequestRow, templateKey: TemplateKey, token: string, actor: string | null) {
  const settings = await getSettings(db);
  const template = await getTemplate(db, templateKey);
  const link = `${await baseUrl()}${linkPath(req.purpose, token)}`;
  const vars = {
    name: firstName(req.recipientName),
    full_name: req.recipientName,
    reviewer_name: firstName(req.recipientName),
    resource_name: req.context.resourceName,
    role_title: req.context.roleTitle,
    client_industry: req.context.clientIndustry,
    due_date: formatDueDate(req.dueDate),
    task: req.purpose === "profile_review" ? `profile review for ${req.context.resourceName ?? "a candidate"}` : "please review your profile information",
    link,
    sender_name: settings.senderName,
  };
  const subject = fill(template.subject, vars).text;
  const text = fill(template.body, vars).text;

  let verified = true;
  if (req.resourceId && req.purpose === "resource_update") {
    const [res] = await db.select({ emailVerified: resources.emailVerified }).from(resources).where(eq(resources.id, req.resourceId));
    verified = !!res?.emailVerified;
  }
  const result = await sendEmail({
    to: req.recipientEmail,
    subject,
    text,
    html: toHtml(text, link),
    recipientVerified: verified,
    templateKey,
    requestId: req.id,
  });
  await logEvent(db, req.id, `email_${result.status}`, { detail: `${templateKey}${result.error ? `: ${result.error}` : ""}`, actor });
  return result;
}

export type NewUpdateRequest = { roleTitle: string; clientIndustry?: string; dueDate: string; requirementId?: string };

/**
 * Asks a resource to review their information. Any earlier open request for the same
 * resource is revoked, so each person has at most one active update link.
 */
export async function createResourceUpdateRequest(db: Db, resource: ResourceRow, input: NewUpdateRequest, adminEmail: string) {
  if (!emailIsSendable(resource)) {
    throw new LinkError(`${resource.name} only has a sample email address. Add their real email before sending.`);
  }
  const settings = await getSettings(db);
  const now = new Date();
  const dueEnd = new Date(`${input.dueDate}T23:59:59Z`);
  const expiresAt = new Date(Math.max(now.getTime() + settings.resourceLinkDays * DAY_MS, dueEnd.getTime()));

  const open = await db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.resourceId, resource.id), eq(accessRequests.purpose, "resource_update"), isNull(accessRequests.completedAt), isNull(accessRequests.revokedAt), gt(accessRequests.expiresAt, now)));
  for (const r of open) await revokeRequest(db, r.id, adminEmail, "Replaced by a new request");

  const [req] = await db
    .insert(accessRequests)
    .values({
      purpose: "resource_update",
      resourceId: resource.id,
      requirementId: input.requirementId ?? null,
      recipientEmail: resource.email,
      recipientName: resource.name,
      context: { roleTitle: input.roleTitle, clientIndustry: input.clientIndustry || undefined, resourceName: resource.name },
      dueDate: input.dueDate,
      expiresAt,
      createdBy: adminEmail,
    })
    .returning();
  await logEvent(db, req.id, "created", { actor: adminEmail, detail: `Due ${input.dueDate}; expires ${expiresAt.toISOString().slice(0, 10)}` });
  const token = await issueToken(db, req.id, "initial");
  const email = await sendTemplated(db, req, "resource_update_request", token, adminEmail);
  return { request: req, email };
}

async function getRequest(db: Db, id: string) {
  const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, id));
  if (!req) throw new LinkError("Request not found.");
  return req;
}

/** Sends the original message again with a fresh link, and extends the expiry. Earlier links keep working. */
export async function resendRequest(db: Db, id: string, adminEmail: string): Promise<SendResult> {
  const req = await getRequest(db, id);
  if (req.completedAt) throw new LinkError("This request is already completed.");
  if (req.revokedAt) throw new LinkError("This request was revoked. Send a new request instead.");
  const settings = await getSettings(db);
  const days = req.purpose === "profile_review" ? settings.reviewerLinkDays : settings.resourceLinkDays;
  const expiresAt = new Date(Math.max(Date.now() + days * DAY_MS, req.expiresAt.getTime()));
  const [updated] = await db.update(accessRequests).set({ expiresAt, updatedAt: new Date() }).where(eq(accessRequests.id, id)).returning();
  await logEvent(db, id, "resent", { actor: adminEmail, detail: `Expiry extended to ${expiresAt.toISOString().slice(0, 10)}` });
  const token = await issueToken(db, id, "resend");
  return sendTemplated(db, updated, req.purpose === "profile_review" ? "reviewer_request" : "resource_update_request", token, adminEmail);
}

export async function remindRequest(db: Db, id: string, actor: string | null): Promise<SendResult> {
  const req = await getRequest(db, id);
  if (!isActive(req)) throw new LinkError("Only open requests can be reminded.");
  await db
    .update(accessRequests)
    .set({ remindersSent: sql`${accessRequests.remindersSent} + 1`, lastReminderAt: new Date(), updatedAt: new Date() })
    .where(eq(accessRequests.id, id));
  await logEvent(db, id, "reminded", { actor });
  const token = await issueToken(db, id, "reminder");
  return sendTemplated(db, req, "reminder", token, actor);
}

export async function revokeRequest(db: Db, id: string, adminEmail: string, reason = "Revoked by admin") {
  const req = await getRequest(db, id);
  if (req.completedAt || req.revokedAt) return;
  await db.update(accessRequests).set({ revokedAt: new Date(), revokeReason: reason, updatedAt: new Date() }).where(eq(accessRequests.id, id));
  await logEvent(db, id, "revoked", { actor: adminEmail, detail: reason });
}

export async function markCompleted(db: Db, id: string, meta: VisitMeta = {}) {
  await db.update(accessRequests).set({ completedAt: new Date(), updatedAt: new Date() }).where(eq(accessRequests.id, id));
  await logEvent(db, id, "completed", meta);
}

/** Looks up a link token. Returns null for unknown tokens; callers check status for expired/revoked/completed. */
export async function resolveToken(db: Db, token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ request: accessRequests, tokenId: accessTokens.id })
    .from(accessTokens)
    .innerJoin(accessRequests, eq(accessTokens.requestId, accessRequests.id))
    .where(eq(accessTokens.tokenHash, hashToken(token)));
  return row ?? null;
}

export async function recordOpen(db: Db, req: AccessRequestRow, tokenId: string, meta: VisitMeta) {
  const now = new Date();
  await db
    .update(accessRequests)
    .set({ openCount: sql`${accessRequests.openCount} + 1`, lastOpenedAt: now, firstOpenedAt: req.firstOpenedAt ?? now })
    .where(eq(accessRequests.id, req.id));
  await logEvent(db, req.id, "opened", { tokenId, ...meta });
}

export async function recordVisit(db: Db, req: AccessRequestRow, tokenId: string, type: string, meta: VisitMeta) {
  await logEvent(db, req.id, type, { tokenId, ...meta });
}

// ---- Optional email code (setting "requireOtp") ----------------------------

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export async function sendOtp(db: Db, req: AccessRequestRow, meta: VisitMeta) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db
    .update(accessRequests)
    .set({ otpHash: hashToken(`${req.id}:${code}`), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 })
    .where(eq(accessRequests.id, req.id));
  const settings = await getSettings(db);
  const text = `Hi ${firstName(req.recipientName)},\n\nYour verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to open a link from us, you can ignore this email.\n\nBest regards,\n${settings.senderName}`;
  let verified = true;
  if (req.resourceId) {
    const [res] = await db.select({ emailVerified: resources.emailVerified }).from(resources).where(eq(resources.id, req.resourceId));
    verified = !!res?.emailVerified;
  }
  await sendEmail({ to: req.recipientEmail, subject: `Your verification code: ${code}`, text, html: toHtml(text), recipientVerified: verified, templateKey: "otp", requestId: req.id });
  await logEvent(db, req.id, "otp_sent", meta);
  return maskEmail(req.recipientEmail);
}

/** Checks a code. On success returns a browser session token to store in a cookie. */
export async function verifyOtp(db: Db, req: AccessRequestRow, code: string, meta: VisitMeta) {
  if (!req.otpHash || !req.otpExpiresAt || req.otpExpiresAt < new Date()) return { ok: false as const, error: "That code has expired. Please request a new one." };
  if (req.otpAttempts >= OTP_MAX_ATTEMPTS) return { ok: false as const, error: "Too many attempts. Please request a new code." };
  if (hashToken(`${req.id}:${code.trim()}`) !== req.otpHash) {
    await db.update(accessRequests).set({ otpAttempts: sql`${accessRequests.otpAttempts} + 1` }).where(eq(accessRequests.id, req.id));
    await logEvent(db, req.id, "otp_failed", meta);
    return { ok: false as const, error: "That code isn't right. Please check it and try again." };
  }
  const session = randomToken();
  await db.update(accessRequests).set({ verifiedSessionHash: hashToken(session), otpHash: null, otpExpiresAt: null }).where(eq(accessRequests.id, req.id));
  await logEvent(db, req.id, "otp_verified", meta);
  return { ok: true as const, session };
}

export function otpCookieName(requestId: string) {
  return `tps_v_${requestId.replace(/-/g, "").slice(0, 16)}`;
}

// ---- Listing and reminders -------------------------------------------------

export async function listRequests(db: Db, opts: { resourceId?: string; limit?: number } = {}) {
  const rows = await db
    .select()
    .from(accessRequests)
    .where(opts.resourceId ? eq(accessRequests.resourceId, opts.resourceId) : undefined)
    .orderBy(desc(accessRequests.createdAt))
    .limit(opts.limit ?? 200);
  return rows;
}

export async function listEvents(db: Db, requestIds: string[]) {
  if (requestIds.length === 0) return [];
  return db.select().from(accessEvents).where(inArray(accessEvents.requestId, requestIds)).orderBy(desc(accessEvents.createdAt));
}

/**
 * Sends the automatic friendly reminder for open requests whose due date is close.
 * Skips requests created in the last 24 hours and those that already got the maximum.
 */
export async function runReminders(db: Db) {
  const settings = await getSettings(db);
  if (settings.maxReminders === 0) return { sent: 0, checked: 0 };
  const now = new Date();
  const remindOnOrBefore = addDaysIso(settings.reminderDaysBeforeDue, now);
  const candidates = await db
    .select()
    .from(accessRequests)
    .where(
      and(
        isNull(accessRequests.completedAt),
        isNull(accessRequests.revokedAt),
        gt(accessRequests.expiresAt, now),
        lte(accessRequests.dueDate, remindOnOrBefore),
        lte(accessRequests.createdAt, new Date(now.getTime() - DAY_MS)),
        sql`${accessRequests.remindersSent} < ${settings.maxReminders}`,
      ),
    );
  let sent = 0;
  for (const req of candidates) {
    const result = await remindRequest(db, req.id, "automatic reminder");
    if (result.status === "sent" || result.status === "dev_inbox") sent++;
  }
  return { sent, checked: candidates.length };
}
