import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestStatusBadge } from "@/components/request-ui";
import { Badge, Button, Card, Input, PageHeader, buttonClass, cx } from "@/components/ui";
import { getDb } from "@/db";
import { resources } from "@/db/schema";
import { env } from "@/lib/env";
import { addDaysIso, formatDueDate, isActive } from "@/lib/links/service";
import { rankResources, scoreResource, type MatchResult } from "@/lib/matching";
import { REQUIREMENT_STATUSES, getRequirement, listCandidates, requestsForRequirement } from "@/lib/requirements";
import { AVAILABILITY_STATUSES } from "@/lib/resources/types";
import { getSettings } from "@/lib/settings";
import { addCandidatesAction, removeCandidateAction, sendCandidateRequestsAction } from "../actions";
import { generateProfileAction } from "../../profiles/actions";
import { PendingButton } from "@/components/pending-button";
import { profilesForRequirement } from "@/lib/profiles/service";
import { PROFILE_STATUSES } from "@/lib/profiles/types";

export const dynamic = "force-dynamic";

const SHORTLIST_SIZE = 20;

function ScorePill({ score }: { score: number }) {
  const tone = score >= 75 ? "bg-emerald-600" : score >= 50 ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right text-sm font-semibold tabular-nums">{score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className={cx("h-full", tone)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/** The "why": matched and missing skills, as chips. */
function Reasons({ m }: { m: MatchResult }) {
  return (
    <div className="flex flex-wrap gap-1">
      {m.matchedMust.map((s) => (
        <span
          key={`m-${s.skill}`}
          title={s.strength === 1 ? `Has ${s.via}${s.projectCount ? `, used in ${s.projectCount} project(s)` : ""}` : `Related skill: ${s.via}`}
          className={cx("rounded-full px-2 py-0.5 text-xs", s.strength === 1 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}
        >
          ✓ {s.skill}
          {s.strength < 1 && <span className="opacity-70"> (via {s.via})</span>}
          {s.projectCount > 0 && <span className="opacity-60"> · {s.projectCount}p</span>}
        </span>
      ))}
      {m.missingMust.map((s) => (
        <span key={`x-${s}`} title="Must-have skill not in their record" className="rounded-full border border-red-200 px-2 py-0.5 text-xs text-red-700">
          ✗ {s}
        </span>
      ))}
      {m.matchedNice.map((s) => (
        <span key={`n-${s.skill}`} title="Nice-to-have" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          + {s.skill}
        </span>
      ))}
    </div>
  );
}

function Breakdown({ m }: { m: MatchResult }) {
  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="cursor-pointer">Score breakdown</summary>
      <ul className="mt-1 space-y-0.5">
        {m.parts.map((p) => (
          <li key={p.label}>
            {p.label}: {Math.round(p.points)}/{p.max} <span className="text-slate-400">({p.detail})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function RequirementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; all?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const req = await getRequirement(db, id).catch(() => null);
  if (!req) notFound();

  const settings = await getSettings(db);
  const candidates = await listCandidates(db, id);
  const proposedIds = new Set(candidates.map((c) => c.resource.id));
  const requests = await requestsForRequirement(db, id, [...proposedIds]);
  const profileMap = await profilesForRequirement(db, id);
  const ranked = rankResources(req, await db.select().from(resources), env.staleAfterDays).filter((m) => !proposedIds.has(m.resource.id));
  const shown = sp.all ? ranked : ranked.slice(0, SHORTLIST_SIZE);

  const today = addDaysIso(0);
  const defaultDue = (() => {
    const byTtl = addDaysIso(Math.max(1, settings.resourceLinkDays - 2));
    const beforeDeadline = req.deadline ? addDaysIso(-2, new Date(`${req.deadline}T00:00:00Z`)) : null;
    const due = beforeDeadline && beforeDeadline < byTtl ? beforeDeadline : byTtl;
    return due < today ? addDaysIso(1) : due;
  })();

  return (
    <>
      <PageHeader
        title={req.roleTitle}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {req.clientName}
            <Badge tone="brand">{REQUIREMENT_STATUSES.find((s) => s.key === req.status)?.label}</Badge>
            {req.domain && <Badge>{req.domain}</Badge>}
            {req.engagementType && <Badge>{req.engagementType}</Badge>}
            {req.minYears != null && <Badge>{req.minYears}+ years</Badge>}
            {req.deadline && <span className="text-slate-500">Deadline {formatDueDate(req.deadline)}</span>}
          </span>
        }
        actions={
          <Link href={`/admin/requirements/${req.id}/edit`} className={buttonClass("secondary")}>
            Edit requirement
          </Link>
        }
      />
      {sp.notice && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{sp.notice}</p>}

      <Card className="mb-6 p-4 text-sm">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <span className="mr-2 text-slate-500">Must-have:</span>
            {req.mustHaveSkills.length ? req.mustHaveSkills.join(", ") : "—"}
          </div>
          <div>
            <span className="mr-2 text-slate-500">Nice-to-have:</span>
            {req.niceToHaveSkills.length ? req.niceToHaveSkills.join(", ") : "—"}
          </div>
        </div>
        {req.notes && (
          <details className="mt-2">
            <summary className="cursor-pointer text-slate-500">Notes / job description</summary>
            <p className="mt-2 whitespace-pre-line text-slate-700">{req.notes}</p>
          </details>
        )}
      </Card>

      {/* ---- Proposed resources ---- */}
      <h2 className="mb-1 text-lg font-semibold">Proposed ({candidates.length})</h2>
      <p className="mb-3 text-sm text-slate-600">
        People you chose for this requirement. Ask them to confirm their information before generating profiles, or skip the request if their record is current. Stale records are
        ticked for you.
      </p>
      {candidates.length === 0 ? (
        <Card className="mb-8 p-6 text-center text-sm text-slate-500">No one proposed yet. Tick people in the matches below and click “Add ticked to proposal”.</Card>
      ) : (
        <form action={sendCandidateRequestsAction} className="mb-8">
          <input type="hidden" name="requirementId" value={req.id} />
          <Card className="divide-y divide-slate-100">
            {candidates.map(({ resource: r, candidate }) => {
              const m = scoreResource(req, r, env.staleAfterDays);
              const lastReq = requests.get(r.id);
              const open = lastReq && isActive(lastReq);
              return (
                <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
                  <input type="checkbox" name="ids" value={r.id} defaultChecked={m.stale && !open && !lastReq?.completedAt} aria-label={`Select ${r.name}`} className="mt-1" />
                  <div className="min-w-48 flex-1">
                    <Link href={`/admin/resources/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.title || "—"} · {m.years ?? "?"} yrs · score {m.score}
                      {candidate.scoreAtSelection != null && candidate.scoreAtSelection !== m.score && ` (was ${candidate.scoreAtSelection} when added)`}
                    </div>
                    <div className="mt-1.5">
                      <Reasons m={m} />
                    </div>
                  </div>
                  <div className="min-w-44 text-xs">
                    {m.stale ? <Badge tone="red">stale · {m.daysSinceUpdate}d</Badge> : <Badge tone="green">current · {m.daysSinceUpdate}d</Badge>}
                    {!r.emailVerified && (
                      <div className="mt-1">
                        <Badge tone="amber">sample email</Badge>
                      </div>
                    )}
                  </div>
                  <div className="min-w-40 text-xs">
                    {lastReq ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          Update request <RequestStatusBadge request={lastReq} />
                        </div>
                        <Link href={`/admin/requests/${lastReq.id}`} className="text-brand underline">
                          {lastReq.submission ? "View their changes" : "Details"}
                        </Link>
                      </div>
                    ) : (
                      <span className="text-slate-500">No update request</span>
                    )}
                  </div>
                  <div className="min-w-44 text-xs">
                    {profileMap.get(r.id) ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          Profile <Badge tone="brand">{PROFILE_STATUSES.find((s) => s.key === profileMap.get(r.id)!.status)?.label}</Badge>
                        </div>
                        <Link href={`/admin/profiles/${profileMap.get(r.id)!.id}`} className="font-medium text-brand underline">
                          View profile (v{profileMap.get(r.id)!.currentVersion})
                        </Link>
                      </div>
                    ) : (
                      <>
                        {open && <div className="mb-1 text-amber-800">Waiting on resource</div>}
                        <PendingButton formAction={generateProfileAction.bind(null, req.id, r.id)} variant="secondary" className="px-2.5 py-1 text-xs" pendingLabel="Working…">
                          Generate profile
                        </PendingButton>
                      </>
                    )}
                  </div>
                  <button
                    formAction={removeCandidateAction.bind(null, req.id, r.id)}
                    className="cursor-pointer rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </Card>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Please complete by
              <Input type="date" name="dueDate" defaultValue={defaultDue} min={today} className="w-auto" />
            </label>
            <Button type="submit">Send update request to ticked</Button>
            <span className="text-xs text-slate-500">Uses this requirement&apos;s role title in the message. Generating a profile can take a minute or two.</span>
          </div>
        </form>
      )}

      {/* ---- Ranked matches ---- */}
      <h2 className="mb-1 text-lg font-semibold">Matches</h2>
      <p className="mb-3 text-sm text-slate-600">
        Ranked by must-have skills (50), nice-to-have skills (15), experience (15), availability (10), domain (5), and data freshness (5). Parts that don&apos;t apply are left
        out and the score is scaled to 100. Hover a skill for details. You decide who to propose.
      </p>
      <form action={addCandidatesAction}>
        <input type="hidden" name="requirementId" value={req.id} />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-10 py-2.5 pl-4">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Person</th>
                <th className="px-3 py-2.5 font-medium">Why</th>
                <th className="px-3 py-2.5 font-medium">Availability</th>
                <th className="px-3 py-2.5 font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {shown.map((m) => (
                <tr key={m.resource.id} className="hover:bg-slate-50">
                  <td className="py-3 pl-4">
                    <input type="checkbox" name="ids" value={m.resource.id} aria-label={`Select ${m.resource.name}`} />
                  </td>
                  <td className="px-3 py-3">
                    <ScorePill score={m.score} />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/resources/${m.resource.id}`} className="font-medium text-brand hover:underline">
                      {m.resource.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {m.resource.title || "—"} · {m.years ?? "?"} yrs
                    </div>
                    <Breakdown m={m} />
                  </td>
                  <td className="px-3 py-3">
                    <Reasons m={m} />
                    {m.domainMatch === false && <div className="mt-1 text-xs text-slate-400">No {req.domain} projects</div>}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700">
                    {AVAILABILITY_STATUSES.find((s) => s.key === m.resource.availabilityStatus)?.label}
                    {m.resource.availableFrom && <div className="text-slate-500">from {m.resource.availableFrom}</div>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {m.stale ? <Badge tone="red">stale · {m.daysSinceUpdate}d</Badge> : <span className="text-slate-500">updated {m.daysSinceUpdate}d ago</span>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Everyone is already proposed, or there are no resources yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={shown.length === 0}>
            Add ticked to proposal
          </Button>
          {!sp.all && ranked.length > SHORTLIST_SIZE && (
            <Link href={`/admin/requirements/${req.id}?all=1`} className="text-sm text-brand underline">
              Show all {ranked.length}
            </Link>
          )}
        </div>
      </form>
    </>
  );
}
