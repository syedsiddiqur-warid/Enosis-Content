import { desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { EmailStatusBadge, RequestActions, RequestStatusBadge } from "@/components/request-ui";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { outboundEmails } from "@/db/schema";
import { formatDueDate, listEvents, listRequests, requestStatus, type RequestStatus } from "@/lib/links/service";
import { EVENT_LABELS } from "./event-labels";

export const dynamic = "force-dynamic";


type Search = { status?: string; notice?: string; sent?: string; devInbox?: string; blocked?: string; failed?: string; skipped?: string; problems?: string };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = await getDb();
  const all = await listRequests(db);
  const filter = sp.status as RequestStatus | undefined;
  const requests = filter ? all.filter((r) => requestStatus(r) === filter) : all;
  const ids = requests.map((r) => r.id);
  const events = await listEvents(db, ids);
  const emails = ids.length
    ? await db.select({ requestId: outboundEmails.requestId, status: outboundEmails.status }).from(outboundEmails).where(inArray(outboundEmails.requestId, ids)).orderBy(desc(outboundEmails.createdAt))
    : [];
  const latestEmail = new Map<string, string>();
  for (const e of emails) if (e.requestId && !latestEmail.has(e.requestId)) latestEmail.set(e.requestId, e.status);

  const counts = all.reduce<Record<string, number>>((acc, r) => {
    const s = requestStatus(r);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const sentSummary = [
    sp.sent && `${sp.sent} sent`,
    sp.devInbox && `${sp.devInbox} delivered to the dev inbox`,
    sp.blocked && `${sp.blocked} blocked`,
    sp.failed && `${sp.failed} failed`,
    sp.skipped && `${sp.skipped} skipped`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Requests"
        description="Update requests sent to resources, with link status and activity. Review requests join this list in phase 6."
        actions={
          <Link href="/admin/resources" className="text-sm text-brand underline">
            Select resources to send a request
          </Link>
        }
      />

      {sentSummary.length > 0 && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Requests: {sentSummary.join(", ")}.{" "}
          {sp.devInbox && (
            <Link href="/dev/inbox" className="font-medium underline">
              Open dev inbox
            </Link>
          )}
          {sp.problems && <div className="mt-1 text-amber-900">{sp.problems.split(" | ").join(" · ")}</div>}
        </div>
      )}
      {sp.notice && <div className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{sp.notice}</div>}

      <div className="mb-4 flex flex-wrap gap-1 text-sm">
        {(["", "sent", "opened", "completed", "expired", "revoked"] as const).map((s) => (
          <Link
            key={s || "all"}
            href={s ? `/admin/requests?status=${s}` : "/admin/requests"}
            className={`rounded-md px-3 py-1.5 ${(filter ?? "") === s ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {s || "All"} {s ? `(${counts[s] ?? 0})` : `(${all.length})`}
          </Link>
        ))}
      </div>

      <Card className="divide-y divide-slate-100">
        {requests.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No requests yet.</p>}
        {requests.map((r) => {
          const evs = events.filter((e) => e.requestId === r.id);
          return (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">
                    {r.resourceId ? (
                      <Link href={`/admin/resources/${r.resourceId}`} className="text-brand hover:underline">
                        {r.recipientName}
                      </Link>
                    ) : (
                      r.recipientName
                    )}
                    <span className="ml-2 text-xs font-normal text-slate-500">{r.purpose === "profile_review" ? "Profile review" : "Update request"}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.recipientEmail} · {r.context.roleTitle}
                    {r.context.clientIndustry && ` · ${r.context.clientIndustry}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <RequestStatusBadge request={r} />
                  <EmailStatusBadge status={latestEmail.get(r.id)} />
                </div>
                <div className="text-xs text-slate-600">
                  <div>Due {formatDueDate(r.dueDate)}</div>
                  <div>
                    Link expires {r.expiresAt.toLocaleDateString()} · opened {r.openCount}× · {r.remindersSent} reminder{r.remindersSent === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Link href={`/admin/requests/${r.id}`} className="text-xs font-medium text-brand underline">
                    {r.submission ? "View changes" : "Details"}
                  </Link>
                  <RequestActions request={r} back="/admin/requests" />
                </div>
              </div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-500">Activity ({evs.length})</summary>
                <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                  {evs.map((e) => (
                    <li key={e.id} className="text-slate-600">
                      <span className="text-slate-400">{e.createdAt.toLocaleString()}</span> · {EVENT_LABELS[e.type] ?? e.type}
                      {e.detail && <span className="text-slate-500"> — {e.detail}</span>}
                      {e.actor && <span className="text-slate-400"> ({e.actor})</span>}
                      {e.userAgent && <span className="text-slate-400"> · {e.userAgent.slice(0, 60)}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </Card>
    </>
  );
}
