import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { accessRequests, profiles, requirements, resources, reviewItems, reviewers, reviews, type AccessRequestRow, type ReviewRow } from "@/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { LinkError, createReviewRequest, markCompleted, revokeRequest, type VisitMeta } from "@/lib/links/service";
import { toHtml } from "@/lib/notify/templates";
import { ruleChecks, factCheck } from "@/lib/profiles/fact-check";
import { getSection, sectionLabel, setSection } from "@/lib/profiles/sections";
import { addProfileVersion, getProfile } from "@/lib/profiles/service";
import { getAiSettings, getSettings } from "@/lib/settings";
import { baseUrl } from "@/lib/url";
import { reviseProfile } from "./revise";

export class ReviewError extends Error {}

// ---- Reviewers -------------------------------------------------------------

export async function listReviewers(db: Db) {
  return db.select().from(reviewers).orderBy(asc(reviewers.name));
}

async function findOrCreateReviewer(db: Db, name: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(reviewers).where(eq(reviewers.email, normalized));
  if (existing) return existing;
  // Addresses typed by an admin are treated as real.
  const [created] = await db.insert(reviewers).values({ name: name.trim(), email: normalized, emailVerified: true }).returning();
  return created;
}

// ---- Sending a profile for review --------------------------------------------

export type SendForReview = { profileId: string; reviewerId?: string; newReviewer?: { name: string; email: string }; dueDate: string };

/** Starts a review round of the current version and emails the reviewer their link. Earlier open rounds are closed. */
export async function sendForReview(db: Db, input: SendForReview, adminEmail: string) {
  const data = await getProfile(db, input.profileId);
  if (!data?.version) throw new ReviewError("Profile not found.");
  if (data.profile.status === "approved" || data.profile.status === "exported") throw new ReviewError("This profile is approved and locked. Reopen it first.");

  const reviewer = input.reviewerId
    ? (await db.select().from(reviewers).where(eq(reviewers.id, input.reviewerId)))[0]
    : input.newReviewer
      ? await findOrCreateReviewer(db, input.newReviewer.name, input.newReviewer.email)
      : undefined;
  if (!reviewer) throw new ReviewError("Choose a reviewer.");

  const [requirement] = await db.select().from(requirements).where(eq(requirements.id, data.profile.requirementId));
  const [resource] = await db.select().from(resources).where(eq(resources.id, data.profile.resourceId));

  const previous = await db.select().from(reviews).where(eq(reviews.profileId, input.profileId)).orderBy(desc(reviews.round));
  for (const r of previous.filter((r) => r.status === "open")) {
    await db.update(reviews).set({ status: "closed", decidedAt: new Date() }).where(eq(reviews.id, r.id));
    if (r.requestId) await revokeRequest(db, r.requestId, adminEmail, "A newer review round was sent");
  }

  const round = (previous[0]?.round ?? 0) + 1;
  const [review] = await db
    .insert(reviews)
    .values({ profileId: input.profileId, reviewerId: reviewer.id, round, baseVersion: data.version.version, workingContent: data.version.content, createdBy: adminEmail })
    .returning();

  let request: AccessRequestRow;
  let emailStatus: string;
  try {
    const sent = await createReviewRequest(
      db,
      {
        reviewer,
        dueDate: input.dueDate,
        resourceId: data.profile.resourceId,
        requirementId: data.profile.requirementId,
        profileId: input.profileId,
        reviewId: review.id,
        round,
        roleTitle: requirement?.roleTitle ?? "",
        resourceName: resource?.name ?? "",
      },
      adminEmail,
    );
    request = sent.request;
    emailStatus = sent.email.status;
  } catch (err) {
    await db.delete(reviews).where(eq(reviews.id, review.id));
    if (err instanceof LinkError) throw new ReviewError(err.message);
    throw err;
  }
  await db.update(reviews).set({ requestId: request.id }).where(eq(reviews.id, review.id));
  await db.update(profiles).set({ status: "in_review", updatedAt: new Date() }).where(eq(profiles.id, input.profileId));
  return { reviewId: review.id, round, emailStatus, reviewer };
}

// ---- Reviewer actions (from the secure link) -----------------------------------

export async function getReviewForRequest(db: Db, req: AccessRequestRow) {
  const reviewId = req.context.reviewId;
  if (!reviewId) return null;
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review) return null;
  const items = await db.select().from(reviewItems).where(eq(reviewItems.reviewId, review.id)).orderBy(asc(reviewItems.createdAt));
  const base = await getProfile(db, review.profileId, review.baseVersion);
  return base?.version ? { review, items, base: base.version.content, profile: base.profile } : null;
}

const str = z.string().max(5000);
const list = z.array(z.string().trim().max(1000)).max(30);
const SECTION_SCHEMAS: Record<string, z.ZodType> = {
  header: z.object({ name: z.string().trim().min(1).max(200), title: z.string().trim().max(200) }),
  summary: str,
  competencies: list,
  expertise: z.array(z.object({ category: z.string().trim().min(1).max(100), items: list })).max(20),
  education: z.array(z.object({ degree: z.string().trim().max(300), institution: z.string().trim().max(300), year: z.string().trim().max(50) })).max(10),
  awards: list,
  project: z.object({
    title: z.string().trim().min(1).max(300),
    industry: z.string().trim().max(200),
    description: str,
    coreTechnologies: z.array(z.string().trim().max(100)).max(50),
    contributions: list,
  }),
};

function schemaFor(key: string) {
  return key.startsWith("project:") ? SECTION_SCHEMAS.project : SECTION_SCHEMAS[key];
}

function assertOpen(review: ReviewRow) {
  if (review.status !== "open") throw new ReviewError("This review is already finished.");
}

/** A direct edit: replaces the section in the working copy and records before/after. */
export async function addEdit(db: Db, review: ReviewRow, section: string, raw: unknown, author: string) {
  assertOpen(review);
  const schema = schemaFor(section);
  if (!schema || getSection(review.workingContent, section) === undefined) throw new ReviewError("Unknown section.");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ReviewError("Please fill in the required fields.");
  const before = getSection(review.workingContent, section);
  const working = setSection(review.workingContent, section, parsed.data);
  const after = getSection(working, section);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  await db.insert(reviewItems).values({ reviewId: review.id, kind: "edit", section, sectionLabel: sectionLabel(working, section), before, after, author });
  await db.update(reviews).set({ workingContent: working }).where(eq(reviews.id, review.id));
}

export async function addSuggestion(db: Db, review: ReviewRow, section: string, quote: string, comment: string, author: string) {
  assertOpen(review);
  if (getSection(review.workingContent, section) === undefined) throw new ReviewError("Unknown section.");
  const c = comment.trim();
  if (!c) throw new ReviewError("Please write your suggestion.");
  await db.insert(reviewItems).values({
    reviewId: review.id,
    kind: "suggestion",
    section,
    sectionLabel: sectionLabel(review.workingContent, section),
    quote: quote.trim().slice(0, 1000),
    comment: c.slice(0, 2000),
    author,
  });
}

export async function deleteSuggestion(db: Db, review: ReviewRow, itemId: string) {
  assertOpen(review);
  await db.delete(reviewItems).where(and(eq(reviewItems.id, itemId), eq(reviewItems.reviewId, review.id), eq(reviewItems.kind, "suggestion")));
}

/** Undoes all of the reviewer's edits to one section, restoring the version they were sent. */
export async function revertSection(db: Db, review: ReviewRow, base: Parameters<typeof getSection>[0], section: string) {
  assertOpen(review);
  const working = setSection(review.workingContent, section, getSection(base, section));
  await db.update(reviews).set({ workingContent: working }).where(eq(reviews.id, review.id));
  await db.delete(reviewItems).where(and(eq(reviewItems.reviewId, review.id), eq(reviewItems.kind, "edit"), eq(reviewItems.section, section)));
}

/**
 * Records the reviewer's decision. Their direct edits become a new version either way.
 * Approve locks the profile. Request changes hands the suggestions to Claude (run after the response).
 */
export async function decide(db: Db, req: AccessRequestRow, review: ReviewRow, decision: "approve" | "changes", overallComment: string, meta: VisitMeta) {
  assertOpen(review);
  const data = await getProfile(db, review.profileId, review.baseVersion);
  if (!data?.version) throw new ReviewError("Profile not found.");
  const items = await db.select().from(reviewItems).where(eq(reviewItems.reviewId, review.id));
  const edited = JSON.stringify(review.workingContent) !== JSON.stringify(data.version.content);
  const ai = await getAiSettings(db);

  let reviewerEditVersion: number | null = null;
  if (edited) {
    reviewerEditVersion = await addProfileVersion(db, review.profileId, {
      content: review.workingContent,
      gaps: data.version.gaps,
      source: "reviewer_edit",
      resourceSnapshot: data.version.resourceSnapshot,
      createdBy: req.recipientEmail,
      factCheck: { flags: ruleChecks(review.workingContent, data.version.resourceSnapshot, ai), checkedAt: new Date().toISOString(), aiChecked: false, aiError: "Reviewer edits; rule-based checks only." },
    });
  }

  const status = decision === "approve" ? "approved" : "changes_requested";
  await db.update(reviews).set({ status, overallComment: overallComment.trim().slice(0, 5000), decidedAt: new Date(), reviewerEditVersion }).where(eq(reviews.id, review.id));
  if (decision === "approve" && !edited) await db.update(profiles).set({ currentVersion: review.baseVersion }).where(eq(profiles.id, review.profileId));
  await db.update(profiles).set({ status, updatedAt: new Date() }).where(eq(profiles.id, review.profileId));
  await markCompleted(db, req.id, meta);

  const suggestions = items.filter((i) => i.kind === "suggestion").length;
  await notifyAdmin(
    db,
    req,
    review,
    decision === "approve"
      ? `${req.recipientName} approved the profile${edited ? " with their own edits" : ""}. It is now locked.`
      : `${req.recipientName} requested changes: ${suggestions} suggestion(s)${edited ? " and some direct edits" : ""}.${suggestions && env.aiMode === "claude" ? " Claude is revising the suggested sections now; you'll get another email when the revision is ready." : ""}`,
  );
  return { decision, suggestions, edited };
}

/** Claude revises only the sections with suggestions; the result becomes a new "revised" version. */
export async function runRevision(db: Db, reviewId: string) {
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!review || review.status !== "changes_requested") return;
  const items = await db.select().from(reviewItems).where(eq(reviewItems.reviewId, reviewId));
  const suggestions = items.filter((i) => i.kind === "suggestion");
  if (suggestions.length === 0) return;
  const [req] = review.requestId ? await db.select().from(accessRequests).where(eq(accessRequests.id, review.requestId)) : [];

  if (env.aiMode !== "claude") {
    await db.update(reviews).set({ revisionError: "AI is not configured, so the suggestions need to be applied by hand." }).where(eq(reviews.id, reviewId));
    return;
  }
  const data = await getProfile(db, review.profileId);
  if (!data?.version) return;
  const ai = await getAiSettings(db);
  const editedSections = [...new Set(items.filter((i) => i.kind === "edit").map((i) => i.section))];
  const result = await reviseProfile(db, {
    content: data.version.content,
    record: data.version.resourceSnapshot,
    suggestions,
    editedSections,
    overallComment: review.overallComment,
    ai,
    ctx: { requirementId: data.profile.requirementId, resourceId: data.profile.resourceId, profileId: data.profile.id, adminEmail: req?.createdBy ?? "system" },
  });
  if ("error" in result) {
    await db.update(reviews).set({ revisionError: result.error }).where(eq(reviews.id, reviewId));
    if (req) await notifyAdmin(db, req, review, `Claude couldn't revise the profile: ${result.error} Please apply the suggestions by hand or try again from the profile page.`);
    return;
  }
  const check = await factCheck(db, result.content, data.version.resourceSnapshot, ai, {
    requirementId: data.profile.requirementId,
    resourceId: data.profile.resourceId,
    profileId: data.profile.id,
    adminEmail: req?.createdBy ?? "system",
  });
  const version = await addProfileVersion(
    db,
    data.profile.id,
    { content: result.content, gaps: data.version.gaps, source: "ai_revision", resourceSnapshot: data.version.resourceSnapshot, createdBy: "claude", aiCallId: result.callId, factCheck: check },
    "revised",
  );
  await db.update(reviews).set({ revisionVersion: version, revisionError: null }).where(eq(reviews.id, reviewId));
  if (req) await notifyAdmin(db, req, review, `Claude revised the suggested sections (version ${version}). Check it and send it back to the reviewer.`);
}

async function notifyAdmin(db: Db, req: AccessRequestRow, review: ReviewRow, message: string) {
  const settings = await getSettings(db);
  const link = `${await baseUrl()}/admin/profiles/${review.profileId}`;
  const text = `Hi,\n\n${message}\n\nProfile: ${req.context.resourceName} for ${req.context.roleTitle} (review round ${review.round})\n${link}\n\n${settings.senderName}`;
  await sendEmail({
    to: req.createdBy,
    subject: `Review update: ${req.context.resourceName}, ${req.context.roleTitle}`,
    text,
    html: toHtml(text),
    recipientVerified: true,
    templateKey: "admin_review",
    requestId: req.id,
  });
}

// ---- Admin views ------------------------------------------------------------------

export async function reviewsForProfile(db: Db, profileId: string) {
  const rows = await db
    .select({ review: reviews, reviewer: reviewers })
    .from(reviews)
    .innerJoin(reviewers, eq(reviews.reviewerId, reviewers.id))
    .where(eq(reviews.profileId, profileId))
    .orderBy(desc(reviews.round));
  const ids = rows.map((r) => r.review.id);
  const items = ids.length ? await db.select().from(reviewItems).where(inArray(reviewItems.reviewId, ids)).orderBy(asc(reviewItems.createdAt)) : [];
  const requestIds = rows.flatMap((r) => (r.review.requestId ? [r.review.requestId] : []));
  const requests = requestIds.length ? await db.select().from(accessRequests).where(inArray(accessRequests.id, requestIds)) : [];
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.reviewId === r.review.id), request: requests.find((q) => q.id === r.review.requestId) ?? null }));
}

export async function reopenProfile(db: Db, profileId: string) {
  await db.update(profiles).set({ status: "revised", updatedAt: new Date() }).where(eq(profiles.id, profileId));
}
