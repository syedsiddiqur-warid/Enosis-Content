import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeList } from "@/components/change-list";
import { RequestActions, RequestStatusBadge } from "@/components/request-ui";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { accessRequests } from "@/db/schema";
import { formatDueDate, listEvents } from "@/lib/links/service";
import { SECTION_TITLES, diffResources } from "@/lib/resources/diff";
import type { Section } from "@/lib/resources/types";
import { EVENT_LABELS } from "../event-labels";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const { notice } = await searchParams;
  const db = await getDb();
  const [req] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .catch(() => []);
  if (!req) notFound();
  const events = await listEvents(db, [req.id]);
  const sub = req.submission;
  const diffs = sub ? diffResources(sub.before, sub.after) : [];

  return (
    <>
      <PageHeader
        title={`${req.recipientName}: ${req.purpose === "profile_review" ? "profile review" : "update request"}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge request={req} />
            {req.context.roleTitle} · due {formatDueDate(req.dueDate)}
            {req.resourceId && (
              <Link href={`/admin/resources/${req.resourceId}`} className="text-brand underline">
                Open resource
              </Link>
            )}
          </span>
        }
        actions={<RequestActions request={req} back={`/admin/requests/${req.id}`} />}
      />
      {notice && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{notice}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div>
          {sub ? (
            <>
              <Card className="mb-4 p-4 text-sm">
                <p>
                  Submitted {new Date(sub.submittedAt).toLocaleString()} by {req.recipientName}.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sub.changedSections.map((s) => (
                    <Badge key={s} tone="amber">
                      Updated: {SECTION_TITLES[s as Section]}
                    </Badge>
                  ))}
                  {sub.confirmedSections.map((s) => (
                    <Badge key={s} tone="green">
                      Still correct: {SECTION_TITLES[s as Section]}
                    </Badge>
                  ))}
                </div>
              </Card>
              <ChangeList diffs={diffs} />
            </>
          ) : (
            <Card className="p-6 text-sm text-slate-600">
              {req.draftSavedAt
                ? `Not submitted yet. ${req.recipientName} has a draft in progress (last saved ${req.draftSavedAt.toLocaleString()}).`
                : "Not submitted yet."}
            </Card>
          )}
        </div>

        <aside>
          <Card className="p-4 text-xs">
            <h3 className="mb-2 text-sm font-semibold">Activity</h3>
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.id} className="text-slate-600">
                  <div className="text-slate-400">{e.createdAt.toLocaleString()}</div>
                  {EVENT_LABELS[e.type] ?? e.type}
                  {e.detail && <span className="text-slate-500"> — {e.detail}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
