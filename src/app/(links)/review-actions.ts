"use server";

import { after } from "next/server";
import { getDb } from "@/db";
import { authorizeLink, visitMeta } from "@/lib/links/visit";
import { ReviewError, addEdit, addSuggestion, decide, deleteSuggestion, getReviewForRequest, revertSection, runRevision } from "@/lib/reviews/service";

type Result = { ok: true } | { ok: false; error: string };
const CLOSED = "This review link is no longer active. If you still need to make changes, please reply to our email.";

/** Resolves the reviewer's link and review round, then runs `fn`. Every reviewer action goes through here. */
async function withReview<T>(token: string, fn: (ctx: NonNullable<Awaited<ReturnType<typeof load>>>) => Promise<T>): Promise<T | Result> {
  const ctx = await load(token);
  if (!ctx) return { ok: false, error: CLOSED };
  try {
    return await fn(ctx);
  } catch (err) {
    if (err instanceof ReviewError) return { ok: false, error: err.message };
    throw err;
  }
}

async function load(token: string) {
  const db = await getDb();
  const req = await authorizeLink(db, token, "profile_review");
  if (!req) return null;
  const data = await getReviewForRequest(db, req);
  return data ? { db, req, ...data } : null;
}

export async function saveEditAction(token: string, section: string, value: unknown): Promise<Result> {
  return withReview(token, async ({ db, req, review }) => {
    await addEdit(db, review, section, value, req.recipientEmail);
    return { ok: true as const };
  });
}

export async function revertSectionAction(token: string, section: string): Promise<Result> {
  return withReview(token, async ({ db, review, base }) => {
    await revertSection(db, review, base, section);
    return { ok: true as const };
  });
}

export async function addSuggestionAction(token: string, section: string, quote: string, comment: string): Promise<Result> {
  return withReview(token, async ({ db, req, review }) => {
    await addSuggestion(db, review, section, quote, comment, req.recipientEmail);
    return { ok: true as const };
  });
}

export async function deleteSuggestionAction(token: string, itemId: string): Promise<Result> {
  return withReview(token, async ({ db, review }) => {
    await deleteSuggestion(db, review, itemId);
    return { ok: true as const };
  });
}

export async function decideAction(token: string, decision: "approve" | "changes", overallComment: string): Promise<Result & { suggestions?: number }> {
  return withReview(token, async ({ db, req, review }) => {
    const result = await decide(db, req, review, decision === "approve" ? "approve" : "changes", overallComment, await visitMeta());
    // Claude's revision can take a minute; run it after the reviewer gets their thank-you page.
    if (result.decision === "changes" && result.suggestions > 0) after(() => runRevision(db, review.id));
    return { ok: true as const, suggestions: result.suggestions };
  });
}
