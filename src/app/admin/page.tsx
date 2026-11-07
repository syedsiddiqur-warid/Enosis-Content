import Link from "next/link";
import { PendingButton } from "@/components/pending-button";
import { RequestActions, RequestStatusBadge } from "@/components/request-ui";
import { Badge, Card, Input, PageHeader, Select, buttonClass, cx } from "@/components/ui";
import { getDb } from "@/db";
import { configIssues } from "@/lib/config-checks";
import { NEXT_STEP, getDashboard, type ProfileStatus } from "@/lib/dashboard";
import { env } from "@/lib/env";
import { formatDueDate } from "@/lib/links/service";
import { PROFILE_STATUSES } from "@/lib/profiles/types";
import { getLastReminderRun, getSettings } from "@/lib/settings";
import { runRemindersNowAction } from "./actions";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; requirement?: string; notice?: string };

const STATUS_TONE: Record<ProfileStatus, "neutral" | "brand" | "green" | "amber" | "red"> = {
  generated: "neutral",
  in_review: "brand",
  changes_requested: "amber",
  revised: "brand",
  approved: "green",
  exported: "green",
};

function Stat({ label, value, hint, href, tone }: { label: string; value: number; hint?: string; href: string; tone?: "amber" | "red" }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-brand">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold", tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-slate-900")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </Link>
  );
}

function dashboardHref(sp: Search, change: Partial<Search>) {
  const next = { q: sp.q, status: sp.status, requirement: sp.requirement, ...change };
  const params = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
  const qs = params.toString();
  return qs ? `/admin?${qs}#pipeline` : "/admin#pipeline";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = await getDb();
  const [d, settings, lastRun] = await Promise.all([
    getDashboard(db, { q: sp.q, status: sp.status, requirementId: sp.requirement }, env.staleAfterDays),
    getSettings(db),
    getLastReminderRun(db),
  ]);
  const issues = configIssues();
  const errors = issues.filter((i) => i.level === "error");
  const others = issues.filter((i) => i.level !== "error");
  const filtered = !!(sp.q || sp.status || sp.requirement);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where every profile is, what is waiting on you, and which links need a nudge."
        actions={
          <Link href="/admin/requirements/new" className={buttonClass("primary")}>
            + New requirement
          </Link>
        }
      />

      {sp.notice && <div className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{sp.notice}</div>}

      {errors.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Setup needs attention before this can be used for real:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((i) => (
              <li key={i.message}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      {others.length > 0 && (
        <details className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <summary className="cursor-pointer">
            {others.length} setup note{others.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {others.map((i) => (
              <li key={i.message}>{i.message}</li>
            ))}
          </ul>
        </details>
      )}

      <form className="mb-5 flex flex-wrap gap-2" action="/admin">
        <div className="w-full sm:w-72">
          <Input name="q" defaultValue={sp.q} placeholder="Search people, clients, roles" />
        </div>
        <div className="w-full sm:w-48">
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">Any profile status</option>
            {PROFILE_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-64">
          <Select name="requirement" defaultValue={sp.requirement ?? ""}>
            <option value="">Any requirement</option>
            {d.requirementOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <button className={buttonClass("secondary")}>Filter</button>
        {filtered && (
          <Link href="/admin" className="self-center text-sm text-slate-600 underline">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open requirements" value={d.totals.openRequirements} href="/admin/requirements" />
        <Stat label="Waiting on you" value={d.totals.waitingOnAdmin} hint="profiles to check, revise or export" href={dashboardHref({}, {})} tone={d.totals.waitingOnAdmin ? "amber" : undefined} />
        <Stat label="Open links" value={d.totals.activeLinks} hint={d.overdue.length ? `${d.overdue.length} overdue` : "none overdue"} href="#links" tone={d.overdue.length ? "red" : undefined} />
        <Stat label="Stale records" value={d.totals.staleResources} hint={`not updated in ${env.staleAfterDays} days`} href="/admin/resources?stale=1" tone={d.totals.staleResources ? "amber" : undefined} />
        <Stat label="Sample emails" value={d.totals.unverifiedEmails} hint={`of ${d.totals.resources} resources, unverified`} href="/admin/import" />
      </div>

      {/* ---- Profile pipeline ---- */}
      <Card className="mb-6" id="pipeline">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-3 text-sm">
          <span className="mr-2 font-semibold">Profile pipeline</span>
          <Link href={dashboardHref(sp, { status: undefined })} className={cx("rounded-md px-2.5 py-1", !sp.status ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100")}>
            All ({Object.values(d.counts).reduce((a, b) => a + b, 0)})
          </Link>
          {PROFILE_STATUSES.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">→</span>}
              <Link href={dashboardHref(sp, { status: s.key })} className={cx("rounded-md px-2.5 py-1", sp.status === s.key ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100")}>
                {s.label} ({d.counts[s.key]})
              </Link>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">Requirement</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Next step</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.pipeline.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    {filtered ? "No profiles match these filters." : "No profiles yet. Open a requirement, propose resources, and generate their profiles."}
                  </td>
                </tr>
              )}
              {d.pipeline.map((row) => {
                const status = row.profile.status as ProfileStatus;
                return (
                  <tr key={row.profile.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/profiles/${row.profile.id}`} className="font-medium text-brand hover:underline">
                        {row.resourceName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/requirements/${row.requirementId}`} className="hover:underline">
                        {row.roleTitle}
                      </Link>
                      <div className="text-xs text-slate-500">{row.clientName}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[status] ?? "neutral"}>{PROFILE_STATUSES.find((s) => s.key === status)?.label ?? status}</Badge>
                      {row.review && row.review.round > 1 && <span className="ml-1 text-xs text-slate-500">round {row.review.round}</span>}
                    </td>
                    <td className={cx("px-4 py-2.5", row.waitingOnAdmin ? "font-medium text-slate-900" : "text-slate-500")}>
                      {row.revisionFailed ? <span className="text-red-700">AI revision failed. Open the profile to retry.</span> : NEXT_STEP[status]}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{row.profile.updatedAt.toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* ---- Open links ---- */}
        <Card id="links">
          <div className="flex items-center justify-between border-b border-slate-100 p-3">
            <span className="text-sm font-semibold">Open links</span>
            <Link href="/admin/requests" className="text-xs text-brand underline">
              All requests
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {d.pendingRequests.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No open links. Everyone has replied.</p>}
            {d.pendingRequests.slice(0, 15).map((r) => {
              const overdue = d.overdue.some((o) => o.id === r.id);
              const expiring = d.expiringSoon.some((o) => o.id === r.id);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                  <div className="min-w-40 flex-1">
                    <Link href={`/admin/requests/${r.id}`} className="font-medium hover:underline">
                      {r.recipientName}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {r.purpose === "profile_review" ? "Profile review" : "Update request"} · {r.context.roleTitle}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RequestStatusBadge request={r} />
                    {overdue && <Badge tone="red">overdue</Badge>}
                    {expiring && <Badge tone="amber">link expires soon</Badge>}
                  </div>
                  <div className="text-xs text-slate-600">
                    Due {formatDueDate(r.dueDate)} · {r.remindersSent} reminder{r.remindersSent === 1 ? "" : "s"}
                  </div>
                  <RequestActions request={r} back="/admin" />
                </div>
              );
            })}
            {d.pendingRequests.length > 15 && (
              <Link href="/admin/requests?status=sent" className="block p-3 text-center text-xs text-brand underline">
                {d.pendingRequests.length - 15} more
              </Link>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {/* ---- Reminders ---- */}
          <Card className="p-4 text-sm">
            <h2 className="mb-1 font-semibold">Reminders</h2>
            <p className="text-slate-600">
              {settings.maxReminders === 0
                ? "Automatic reminders are off."
                : `A friendly reminder goes out ${settings.reminderDaysBeforeDue} day${settings.reminderDaysBeforeDue === 1 ? "" : "s"} before the due date, up to ${settings.maxReminders} per request, at most once a day.`}{" "}
              <Link href="/admin/settings" className="text-brand underline">
                Change
              </Link>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {lastRun
                ? `Last run ${new Date(lastRun.at).toLocaleString()} (${lastRun.by}): ${lastRun.sent} sent${lastRun.blocked ? `, ${lastRun.blocked} blocked` : ""}${lastRun.failed ? `, ${lastRun.failed} failed` : ""}.`
                : "The reminder job hasn't run yet."}
              {!env.cronSecret && " No CRON_SECRET, so it only runs when started here."}
            </p>
            <form action={runRemindersNowAction} className="mt-3">
              <PendingButton variant="secondary" pendingLabel="Sending reminders…">
                Run reminders now
              </PendingButton>
            </form>
          </Card>

          {/* ---- Requirements ---- */}
          <Card>
            <div className="border-b border-slate-100 p-3 text-sm font-semibold">Open requirements</div>
            <div className="divide-y divide-slate-100 text-sm">
              {d.requirementsDue.length === 0 && <p className="p-4 text-center text-slate-500">No open requirements.</p>}
              {d.requirementsDue.slice(0, 8).map(({ requirement: r, candidates, profiles, daysLeft }) => (
                <Link key={r.id} href={`/admin/requirements/${r.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                  <div className="flex-1">
                    <div className="font-medium">{r.roleTitle}</div>
                    <div className="text-xs text-slate-500">
                      {r.clientName} · {candidates} proposed · {profiles} profile{profiles === 1 ? "" : "s"}
                    </div>
                  </div>
                  {daysLeft !== null && (
                    <Badge tone={daysLeft < 0 ? "red" : daysLeft <= 3 ? "amber" : "neutral"}>{daysLeft < 0 ? `${-daysLeft}d past deadline` : daysLeft === 0 ? "due today" : `${daysLeft}d left`}</Badge>
                  )}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ---- Stale records ---- */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 p-3">
            <span className="text-sm font-semibold">Stale records</span>
            <Link href="/admin/resources?stale=1" className="text-xs text-brand underline">
              All stale ({d.stale.length})
            </Link>
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            {d.stale.length === 0 && <p className="p-4 text-center text-slate-500">Every record was updated in the last {env.staleAfterDays} days.</p>}
            {d.stale.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <Link href={`/admin/resources/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.title || "No title"} · updated {r.daysSinceUpdate} days ago
                  </div>
                </div>
                {r.requestPending ? (
                  <Badge tone="brand">update requested</Badge>
                ) : (
                  <Link href={`/admin/requests/new?ids=${r.id}`} className="text-xs font-medium text-brand underline">
                    Ask for an update
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ---- Recent submissions ---- */}
        <Card>
          <div className="border-b border-slate-100 p-3 text-sm font-semibold">Updates submitted this week</div>
          <div className="divide-y divide-slate-100 text-sm">
            {d.recentSubmissions.length === 0 && <p className="p-4 text-center text-slate-500">No updates submitted in the last 7 days.</p>}
            {d.recentSubmissions.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <div className="font-medium">{r.recipientName}</div>
                  <div className="text-xs text-slate-500">
                    {r.context.roleTitle} · {r.completedAt!.toLocaleDateString()}
                  </div>
                </div>
                <Link href={`/admin/requests/${r.id}`} className="text-xs font-medium text-brand underline">
                  View changes
                </Link>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
