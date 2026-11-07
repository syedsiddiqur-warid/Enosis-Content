import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeList } from "@/components/change-list";
import { PendingButton } from "@/components/pending-button";
import { ProfileDocument } from "@/components/profile-document";
import { RequestStatusBadge } from "@/components/request-ui";
import { Badge, Card, PageHeader, buttonClass, cx } from "@/components/ui";
import { getDb } from "@/db";
import { aiCalls, requirements, resources } from "@/db/schema";
import { env } from "@/lib/env";
import { addDaysIso } from "@/lib/links/service";
import { diffProfiles } from "@/lib/profiles/sections";
import { getProfile } from "@/lib/profiles/service";
import { PROFILE_STATUSES } from "@/lib/profiles/types";
import { listReviewers, reviewsForProfile } from "@/lib/reviews/service";
import { getSettings } from "@/lib/settings";
import { recheckProfileAction, regenerateProfileAction, reopenProfileAction, restoreVersionAction, retryRevisionAction } from "../actions";
import { ProfileEditor } from "./profile-editor";
import { SendReviewForm } from "./send-review-form";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  ai: "Written by Claude",
  offline: "Offline draft (no AI)",
  admin_edit: "Edited by admin",
  reviewer_edit: "Edited by reviewer",
  ai_revision: "Revised by Claude",
};

const SEVERITY = { high: "red", medium: "amber", low: "neutral" } as const;
const ROUND_STATUS = { open: ["In review", "brand"], approved: ["Approved", "green"], changes_requested: ["Changes requested", "amber"], closed: ["Closed", "neutral"] } as const;

type Search = { v?: string; edit?: string; notice?: string; compare?: string };

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const data = await getProfile(db, id, sp.v ? Number(sp.v) : undefined).catch(() => null);
  if (!data?.version) notFound();
  const { profile, version, versions } = data;
  const [requirement] = await db.select().from(requirements).where(eq(requirements.id, profile.requirementId));
  const [resource] = await db.select().from(resources).where(eq(resources.id, profile.resourceId));
  const [call] = version.aiCallId ? await db.select().from(aiCalls).where(eq(aiCalls.id, version.aiCallId)) : [];
  const rounds = await reviewsForProfile(db, id);
  const reviewerList = await listReviewers(db);
  const settings = await getSettings(db);

  const isCurrent = version.version === profile.currentVersion;
  const locked = profile.status === "approved" || profile.status === "exported";
  const inReview = profile.status === "in_review";
  const flags = [...(version.factCheck?.flags ?? [])].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const highCount = flags.filter((f) => f.severity === "high").length;
  const recordChanged = resource && resource.updatedAt > version.createdAt;

  // ?compare=3-5 shows what changed between two versions.
  const [cmpA, cmpB] = (sp.compare ?? "").split("-").map(Number);
  const compare = cmpA && cmpB ? await Promise.all([getProfile(db, id, cmpA), getProfile(db, id, cmpB)]) : null;

  return (
    <>
      <PageHeader
        title={`${resource?.name ?? "Resource"}: ${requirement?.roleTitle ?? ""}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/requirements/${profile.requirementId}`} className="text-brand underline">
              {requirement?.clientName}
            </Link>
            <Badge tone={locked ? "green" : "brand"}>{PROFILE_STATUSES.find((s) => s.key === profile.status)?.label ?? profile.status}</Badge>
            <Badge>
              v{version.version} · {SOURCE_LABEL[version.source] ?? version.source}
            </Badge>
            {!isCurrent && <Badge tone="amber">older version</Badge>}
            {locked && <span className="text-xs text-emerald-800">🔒 Approved and locked</span>}
          </span>
        }
        actions={
          locked ? (
            <form action={reopenProfileAction.bind(null, id)}>
              <PendingButton variant="secondary" pendingLabel="Reopening…">
                Reopen for changes
              </PendingButton>
            </form>
          ) : isCurrent && !sp.edit && !compare ? (
            <>
              <Link href={`/admin/profiles/${id}?edit=1`} className={buttonClass("secondary")}>
                Edit
              </Link>
              <form action={recheckProfileAction.bind(null, id)}>
                <PendingButton variant="secondary" pendingLabel="Checking…">
                  Re-run fact check
                </PendingButton>
              </form>
              <form action={regenerateProfileAction.bind(null, id)}>
                <PendingButton pendingLabel="Generating… (up to a minute or two)">Regenerate</PendingButton>
              </form>
            </>
          ) : !isCurrent && !compare ? (
            <form action={restoreVersionAction.bind(null, id, version.version)}>
              <PendingButton variant="secondary" pendingLabel="Restoring…">
                Restore this version
              </PendingButton>
            </form>
          ) : null
        }
      />
      {sp.notice && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{sp.notice}</p>}
      {inReview && isCurrent && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">Out for review. Edits you make now won&apos;t appear in the reviewer&apos;s copy; send a new round if you change it.</p>}
      {recordChanged && isCurrent && !locked && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {resource.name}&apos;s record changed after this version was written. Regenerate to use the latest information.
        </p>
      )}

      {sp.edit && isCurrent && !locked ? (
        <ProfileEditor profileId={id} initial={version.content} sourceProjects={version.resourceSnapshot.projects.map((p) => p.name)} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
          <div className="min-w-0 overflow-x-auto">
            {compare?.[0]?.version && compare[1]?.version ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    Changes from v{cmpA} to v{cmpB}
                  </h2>
                  <Link href={`/admin/profiles/${id}`} className="text-sm text-brand underline">
                    Back to profile
                  </Link>
                </div>
                <ChangeList diffs={diffProfiles(compare[0].version.content, compare[1].version.content)} emptyText="These versions are identical." />
              </>
            ) : (
              <ProfileDocument content={version.content} />
            )}
          </div>

          <aside className="space-y-5">
            {!locked && isCurrent && (
              <Card className="p-4">
                <h3 className="mb-1 text-sm font-semibold">{rounds.length ? "Send back for review" : "Send for review"}</h3>
                <p className="mb-3 text-xs text-slate-500">The reviewer gets a secure link to this version. No login needed.</p>
                <SendReviewForm
                  profileId={id}
                  reviewers={reviewerList}
                  defaultReviewerId={rounds[0]?.reviewer.id}
                  defaultDue={addDaysIso(Math.max(1, settings.reviewerLinkDays - 1))}
                  minDate={addDaysIso(0)}
                  highFlags={highCount}
                  label={rounds.length ? `Send round ${rounds[0].review.round + 1}` : "Send for review"}
                />
              </Card>
            )}

            {rounds.length > 0 && (
              <Card className="p-4 text-sm">
                <h3 className="mb-2 font-semibold">Reviews</h3>
                <div className="space-y-4">
                  {rounds.map(({ review, reviewer, items, request }) => {
                    const [label, tone] = ROUND_STATUS[review.status as keyof typeof ROUND_STATUS] ?? [review.status, "neutral"];
                    const sugg = items.filter((i) => i.kind === "suggestion");
                    const editSections = [...new Set(items.filter((i) => i.kind === "edit").map((i) => i.sectionLabel))];
                    return (
                      <div key={review.id} className="border-t border-slate-100 pt-3 text-xs first:border-0 first:pt-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-800">Round {review.round}</span>
                          <Badge tone={tone}>{label}</Badge>
                          {request && review.status === "open" && <RequestStatusBadge request={request} />}
                        </div>
                        <p className="mt-0.5 text-slate-500">
                          {reviewer.name} · v{review.baseVersion}
                          {review.decidedAt && ` · ${review.decidedAt.toLocaleDateString()}`}
                          {request && (
                            <>
                              {" · "}
                              <Link href={`/admin/requests/${request.id}`} className="text-brand underline">
                                link activity
                              </Link>
                            </>
                          )}
                        </p>
                        {review.overallComment && <p className="mt-1 rounded bg-slate-50 p-2 text-slate-700">“{review.overallComment}”</p>}
                        {editSections.length > 0 && <p className="mt-1 text-slate-600">Edited directly: {editSections.join(", ")}</p>}
                        {sugg.length > 0 && (
                          <ul className="mt-1 space-y-1">
                            {sugg.map((s) => (
                              <li key={s.id} className="border-l-2 border-amber-300 pl-2">
                                <span className="font-medium text-slate-700">{s.sectionLabel}:</span> {s.quote && <span className="text-slate-500 italic">“{s.quote}” </span>}
                                {s.comment}
                              </li>
                            ))}
                          </ul>
                        )}
                        {review.reviewerEditVersion && <p className="mt-1 text-slate-600">Reviewer edits saved as v{review.reviewerEditVersion}.</p>}
                        {review.revisionVersion && (
                          <p className="mt-1 text-emerald-800">
                            Claude revised the suggested sections: v{review.revisionVersion}.{" "}
                            <Link href={`/admin/profiles/${id}?compare=${review.reviewerEditVersion ?? review.baseVersion}-${review.revisionVersion}`} className="underline">
                              See what changed
                            </Link>
                          </p>
                        )}
                        {review.status === "changes_requested" && !review.revisionVersion && sugg.length > 0 && (
                          <div className="mt-1 text-amber-900">
                            {review.revisionError ?? "Claude is revising the suggested sections…"}
                            {review.revisionError && env.aiMode === "claude" && (
                              <form action={retryRevisionAction.bind(null, id, review.id)} className="mt-1">
                                <PendingButton variant="secondary" className="px-2 py-1 text-xs" pendingLabel="Revising…">
                                  Try the revision again
                                </PendingButton>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card className={cx("p-4 text-sm", highCount ? "border-red-200" : "")}>
              <h3 className="mb-1 font-semibold">Fact check (v{version.version})</h3>
              <p className="mb-3 text-xs text-slate-500">
                {version.factCheck?.aiChecked ? "Rule-based checks and a Claude review against the record." : (version.factCheck?.aiError ?? "Rule-based checks only.")}
              </p>
              {flags.length === 0 ? (
                <p className="text-emerald-700">✓ Every claim traces back to the record.</p>
              ) : (
                <ul className="space-y-3">
                  {flags.map((f, i) => (
                    <li key={i} className="text-xs">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={SEVERITY[f.severity]}>{f.severity}</Badge>
                        <span className="font-medium text-slate-700">{f.section}</span>
                        <span className="text-slate-400">· {f.source === "ai" ? "Claude" : "rules"}</span>
                      </div>
                      {f.quote && <p className="text-slate-500 italic">“{f.quote.length > 140 ? `${f.quote.slice(0, 140)}…` : f.quote}”</p>}
                      <p className="text-slate-700">{f.issue}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 text-sm">
              <h3 className="mb-1 font-semibold">Gaps (internal only)</h3>
              <p className="mb-2 text-xs text-slate-500">Requirement skills the record doesn&apos;t support. Never shown in the profile.</p>
              {version.gaps.length === 0 ? (
                <p className="text-slate-500">None.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {version.gaps.map((g) => (
                    <li key={g}>
                      <Badge tone="red">{g}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4 text-sm">
              <h3 className="mb-2 font-semibold">Versions</h3>
              <ul className="space-y-1.5 text-xs">
                {versions.map((v, i) => {
                  const prev = versions[i + 1];
                  return (
                    <li key={v.version}>
                      <Link href={`/admin/profiles/${id}?v=${v.version}`} className={cx("hover:underline", v.version === version.version && !compare ? "font-semibold text-slate-900" : "text-brand")}>
                        v{v.version}
                      </Link>{" "}
                      · {SOURCE_LABEL[v.source] ?? v.source} · {v.createdAt.toLocaleString()}
                      {v.version === profile.currentVersion && <span className="text-emerald-700"> · current</span>}
                      {prev && (
                        <>
                          {" · "}
                          <Link href={`/admin/profiles/${id}?compare=${prev.version}-${v.version}`} className="text-brand underline">
                            changes
                          </Link>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {call && (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  Model {call.model} · attempt {call.attempt} · {Math.round((call.durationMs ?? 0) / 1000)}s
                </p>
              )}
              {env.aiMode === "offline" && <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-amber-800">AI isn&apos;t configured. Add ANTHROPIC_API_KEY to use Claude.</p>}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
