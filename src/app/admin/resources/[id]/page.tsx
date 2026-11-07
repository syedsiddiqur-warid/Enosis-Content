import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge, Button, Card, PageHeader, buttonClass } from "@/components/ui";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { getResource, getVersions, isStale } from "@/lib/resources/service";
import {
  ACHIEVEMENT_KINDS,
  AVAILABILITY_STATUSES,
  EDUCATION_LEVELS,
  SECTIONS,
  SKILL_CATEGORIES,
  totalYears,
  type SectionUpdates,
} from "@/lib/resources/types";
import { setArchivedAction } from "../actions";
import { RequestActions, RequestStatusBadge } from "@/components/request-ui";
import { listRequests } from "@/lib/links/service";
import { requirementsForResource } from "@/lib/requirements";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  personal: "Personal details",
  experience: "Experience",
  skills: "Tech stack",
  education: "Education",
  achievements: "Achievements",
  projects: "Projects",
};

function Block({ title, section, updates, children }: { title: string; section?: string; updates?: SectionUpdates; children: ReactNode }) {
  const u = section ? updates?.[section as keyof SectionUpdates] : undefined;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {u && (
          <span className="text-xs text-slate-500">
            Updated {new Date(u.at).toLocaleDateString()} by {u.by}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}

const Empty = () => <p className="text-sm text-slate-400">Nothing recorded yet.</p>;

export default async function ResourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const { notice } = await searchParams;
  const db = await getDb();
  const r = await getResource(db, id).catch(() => null);
  if (!r) notFound();
  const versions = await getVersions(db, id);
  const requests = await listRequests(db, { resourceId: id, limit: 5 });
  const proposedFor = await requirementsForResource(db, id);
  const years = totalYears(r);
  const availability = AVAILABILITY_STATUSES.find((s) => s.key === r.availabilityStatus)?.label;

  return (
    <>
      <PageHeader
        title={r.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {r.title || "No title"}
            {r.seniority && <Badge>{r.seniority}</Badge>}
            {r.archivedAt && <Badge tone="red">archived</Badge>}
            {isStale(r, env.staleAfterDays) && <Badge tone="red">stale</Badge>}
          </span>
        }
        actions={
          <>
            {!r.archivedAt && (
              <Link href={`/admin/requests/new?ids=${r.id}`} className={buttonClass("secondary")}>
                Send update request
              </Link>
            )}
            <form action={setArchivedAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="archived" value={r.archivedAt ? "false" : "true"} />
              <Button variant={r.archivedAt ? "secondary" : "danger"}>{r.archivedAt ? "Restore" : "Archive"}</Button>
            </form>
            <Link href={`/admin/resources/${r.id}/edit`} className={buttonClass("primary")}>
              Edit
            </Link>
          </>
        }
      />
      {notice && <p className="mb-4 rounded-md bg-brand-soft p-3 text-sm text-brand">{notice}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          <Block title="Experience and expertise" section="experience" updates={r.sectionUpdates}>
            <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Total</dt>
                <dd className="font-medium">{years == null ? "—" : `${years} yrs`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">At Enosis</dt>
                <dd className="font-medium">{r.yearsEnosis ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Previous</dt>
                <dd className="font-medium">{r.yearsPrevious ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Availability</dt>
                <dd className="font-medium">
                  {availability}
                  {r.availableFrom && ` from ${r.availableFrom}`}
                </dd>
              </div>
            </dl>
            {r.majorExpertise ? <p className="text-sm whitespace-pre-line text-slate-700">{r.majorExpertise}</p> : <Empty />}
            {r.domains.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {r.domains.map((d) => (
                  <Badge key={d} tone="brand">
                    {d}
                  </Badge>
                ))}
              </div>
            )}
          </Block>

          <Block title="Tech stack" section="skills" updates={r.sectionUpdates}>
            {r.skills.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {SKILL_CATEGORIES.map((c) => {
                    const items = r.skills.filter((s) => s.category === c.key);
                    if (items.length === 0) return null;
                    return (
                      <tr key={c.key}>
                        <th className="w-44 py-2 pr-4 text-left align-top font-medium text-slate-600">{c.label}</th>
                        <td className="py-2 text-slate-800">{items.map((s) => s.name).join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Block>

          <Block title="Education" section="education" updates={r.sectionUpdates}>
            {r.education.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1 text-sm">
                {r.education.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.degree || EDUCATION_LEVELS.find((l) => l.key === e.level)?.label}</span>
                    {e.institution && `, ${e.institution}`}
                    {e.year && <span className="text-slate-500"> ({e.year})</span>}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Achievements and certifications" section="achievements" updates={r.sectionUpdates}>
            {r.achievements.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {r.achievements.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge>{ACHIEVEMENT_KINDS.find((k) => k.key === a.kind)?.label}</Badge>
                    <span>
                      {a.name}
                      {a.issuer && <span className="text-slate-500"> · {a.issuer}</span>}
                      {a.year && <span className="text-slate-500"> · {a.year}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title={`Projects (${r.projects.length})`} section="projects" updates={r.sectionUpdates}>
            {r.projects.length === 0 && <Empty />}
            <div className="space-y-5">
              {r.projects.map((p, i) => (
                <div key={i} className="border-l-2 border-brand/30 pl-4">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="mb-2 text-xs text-slate-500">
                    {[p.type, p.industry, p.clientName && `Client: ${p.clientName} (internal)`, p.atEnosis ? "At Enosis" : "Previous workplace", p.role, p.duration]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.brief && <p className="mb-2 text-sm whitespace-pre-line text-slate-700">{p.brief}</p>}
                  {p.features && <p className="mb-2 text-sm whitespace-pre-line text-slate-600">{p.features}</p>}
                  {p.technologies.length > 0 && (
                    <p className="mb-2 text-sm">
                      <span className="font-medium text-slate-600">Core technologies: </span>
                      {p.technologies.join(", ")}
                    </p>
                  )}
                  {p.contributions.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                      {p.contributions.map((c, j) => (
                        <li key={j}>{c}</li>
                      ))}
                    </ul>
                  )}
                  {p.outcomes && <p className="mt-2 text-sm text-slate-700">Outcomes: {p.outcomes}</p>}
                </div>
              ))}
            </div>
          </Block>
        </div>

        <aside className="space-y-5">
          {proposedFor.length > 0 && (
            <Card className="p-4 text-sm">
              <h3 className="mb-2 font-semibold">Proposed for</h3>
              <ul className="space-y-1">
                {proposedFor.map(({ requirement: q }) => (
                  <li key={q.id}>
                    <Link href={`/admin/requirements/${q.id}`} className="text-brand hover:underline">
                      {q.roleTitle}
                    </Link>
                    <span className="text-xs text-slate-500"> · {q.clientName}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">Update requests</h3>
            {requests.length === 0 ? (
              <p className="text-slate-500">None sent yet.</p>
            ) : (
              <ul className="space-y-3">
                {requests.map((q) => (
                  <li key={q.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RequestStatusBadge request={q} />
                      <span className="text-slate-700">{q.context.roleTitle}</span>
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      Sent {q.createdAt.toLocaleDateString()} · due {q.dueDate} · opened {q.openCount}×
                    </div>
                    {q.submission && (
                      <Link href={`/admin/requests/${q.id}`} className="font-medium text-brand underline">
                        View their changes
                      </Link>
                    )}
                    <RequestActions request={q} back={`/admin/resources/${r.id}`} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/requests" className="mt-2 inline-block text-xs text-brand underline">
              All requests and activity
            </Link>
          </Card>
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">Contact</h3>
            <p className="break-all">{r.email}</p>
            {r.emailVerified ? (
              <Badge tone="green">verified</Badge>
            ) : (
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Sample address generated on import. No real emails will be sent to it until you replace it with the person&apos;s real email.
              </p>
            )}
          </Card>
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">Data freshness</h3>
            <p className="text-slate-600">
              Last updated {r.updatedAt.toLocaleString()} by {r.lastUpdatedBy}.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {SECTIONS.map((s) => (
                <li key={s}>
                  {SECTION_LABELS[s]}: {r.sectionUpdates[s] ? new Date(r.sectionUpdates[s]!.at).toLocaleDateString() : "—"}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">Version history</h3>
            {versions.length === 0 ? (
              <p className="text-slate-500">No earlier versions.</p>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="text-xs">
                    <span className="font-medium text-slate-700">v{v.version}</span> · {v.createdAt.toLocaleString()}
                    <div className="text-slate-500">
                      {v.note} — {v.changedBy}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
