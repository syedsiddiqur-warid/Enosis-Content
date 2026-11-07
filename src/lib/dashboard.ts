import "server-only";
import { desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accessRequests, profiles, requirementCandidates, requirements, resources, reviews } from "@/db/schema";
import { isActive } from "./links/service";
import { PROFILE_STATUSES } from "./profiles/types";
import { isStale } from "./resources/service";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProfileStatus = (typeof PROFILE_STATUSES)[number]["key"];

/** What the admin should do next for a profile in each status. */
export const NEXT_STEP: Record<ProfileStatus, string> = {
  generated: "Check it and send for review",
  in_review: "Waiting for the reviewer",
  changes_requested: "Run the AI revision",
  revised: "Check the revision and send back for review",
  approved: "Export the final file",
  exported: "Done",
};

export type PipelineFilter = { q?: string; status?: string; requirementId?: string };

function todayIso(now: Date) {
  return now.toISOString().slice(0, 10);
}

function matches(q: string, ...values: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase();
  return !needle || values.some((v) => v?.toLowerCase().includes(needle));
}

export async function getDashboard(db: Db, filter: PipelineFilter, staleAfterDays: number, now = new Date()) {
  const today = todayIso(now);

  const [profileRows, latestReviews, requestRows, resourceRows, openRequirements] = await Promise.all([
    db
      .select({ profile: profiles, resourceName: resources.name, clientName: requirements.clientName, roleTitle: requirements.roleTitle, requirementId: requirements.id })
      .from(profiles)
      .innerJoin(resources, eq(profiles.resourceId, resources.id))
      .innerJoin(requirements, eq(profiles.requirementId, requirements.id))
      .orderBy(desc(profiles.updatedAt)),
    // Latest round per profile, for revision errors and who is reviewing.
    db.selectDistinctOn([reviews.profileId], { profileId: reviews.profileId, round: reviews.round, status: reviews.status, revisionError: reviews.revisionError, revisionVersion: reviews.revisionVersion })
      .from(reviews)
      .orderBy(reviews.profileId, desc(reviews.round)),
    db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt)).limit(500),
    db.select({ id: resources.id, name: resources.name, title: resources.title, email: resources.email, emailVerified: resources.emailVerified, updatedAt: resources.updatedAt }).from(resources).where(isNull(resources.archivedAt)),
    db
      .select({
        requirement: requirements,
        candidates: sql<number>`(select count(*)::int from ${requirementCandidates} where ${requirementCandidates.requirementId} = ${requirements.id})`,
        profiles: sql<number>`(select count(*)::int from ${profiles} where ${profiles.requirementId} = ${requirements.id})`,
      })
      .from(requirements)
      .where(eq(requirements.status, "open"))
      .orderBy(sql`${requirements.deadline} asc nulls last`),
  ]);

  const reviewByProfile = new Map(latestReviews.map((r) => [r.profileId, r]));

  // ---- Profile pipeline ----
  const counts = Object.fromEntries(PROFILE_STATUSES.map((s) => [s.key, 0])) as Record<ProfileStatus, number>;
  for (const row of profileRows) counts[row.profile.status as ProfileStatus]++;

  const pipeline = profileRows
    .filter((row) => !filter.status || row.profile.status === filter.status)
    .filter((row) => !filter.requirementId || row.requirementId === filter.requirementId)
    .filter((row) => matches(filter.q ?? "", row.resourceName, row.clientName, row.roleTitle))
    .map((row) => {
      const review = reviewByProfile.get(row.profile.id);
      const revisionFailed = row.profile.status === "changes_requested" && !!review?.revisionError && !review.revisionVersion;
      return { ...row, review, revisionFailed, waitingOnAdmin: row.profile.status !== "in_review" && row.profile.status !== "exported" };
    });

  // ---- Links ----
  const active = requestRows.filter(isActive);
  const overdue = active.filter((r) => r.dueDate && r.dueDate < today);
  const expiringSoon = active.filter((r) => r.expiresAt.getTime() - now.getTime() < 2 * DAY_MS && !(r.dueDate && r.dueDate < today));
  const pendingRequests = active
    .filter((r) => matches(filter.q ?? "", r.recipientName, r.recipientEmail, r.context.roleTitle))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const recentSubmissions = requestRows.filter((r) => r.purpose === "resource_update" && r.completedAt && now.getTime() - r.completedAt.getTime() < 7 * DAY_MS);

  // ---- Resources ----
  const pendingUpdateFor = new Set(active.filter((r) => r.purpose === "resource_update").map((r) => r.resourceId));
  const stale = resourceRows
    .filter((r) => isStale(r, staleAfterDays))
    .filter((r) => matches(filter.q ?? "", r.name, r.title))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((r) => ({ ...r, daysSinceUpdate: Math.floor((now.getTime() - r.updatedAt.getTime()) / DAY_MS), requestPending: pendingUpdateFor.has(r.id) }));

  // ---- Requirements ----
  const requirementsDue = openRequirements.map((r) => ({
    ...r,
    daysLeft: r.requirement.deadline ? Math.ceil((Date.parse(r.requirement.deadline) - Date.parse(today)) / DAY_MS) : null,
  }));

  return {
    counts,
    pipeline,
    pendingRequests,
    overdue,
    expiringSoon,
    recentSubmissions,
    stale,
    totals: {
      resources: resourceRows.length,
      unverifiedEmails: resourceRows.filter((r) => !r.emailVerified).length,
      staleResources: resourceRows.filter((r) => isStale(r, staleAfterDays)).length,
      openRequirements: openRequirements.length,
      activeLinks: active.length,
      waitingOnAdmin: profileRows.filter((r) => r.profile.status !== "in_review" && r.profile.status !== "exported").length,
    },
    requirementsDue,
    // Every requirement that has profiles, so the filter also covers closed ones.
    requirementOptions: [...new Map(profileRows.map((r) => [r.requirementId, `${r.roleTitle} · ${r.clientName}`])).entries()],
  };
}
