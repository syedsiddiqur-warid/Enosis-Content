import Link from "next/link";
import { Badge, Card, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { isStale, listResources } from "@/lib/resources/service";
import { AVAILABILITY_STATUSES, SENIORITY_LEVELS, totalYears } from "@/lib/resources/types";

export const dynamic = "force-dynamic";

type Search = { q?: string; skill?: string; seniority?: string; availability?: string; stale?: string; archived?: string };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = await getDb();
  const rows = await listResources(db, {
    q: sp.q,
    skill: sp.skill,
    seniority: sp.seniority,
    availability: sp.availability,
    stale: sp.stale === "1",
    archived: sp.archived === "1",
    staleAfterDays: env.staleAfterDays,
  });

  return (
    <>
      <PageHeader
        title={sp.archived === "1" ? "Archived resources" : "Resources"}
        description={`${rows.length} ${rows.length === 1 ? "person" : "people"}. Records not updated in ${env.staleAfterDays} days are marked stale.`}
        actions={
          <>
            <Link href="/admin/import" className={buttonClass("secondary")}>
              Import CSV
            </Link>
            <Link href="/admin/resources/new" className={buttonClass("primary")}>
              + New resource
            </Link>
          </>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_9rem_11rem_auto_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="Search name, email, title…" />
        <Input name="skill" defaultValue={sp.skill} placeholder="Skill, e.g. React" />
        <Select name="seniority" defaultValue={sp.seniority ?? ""}>
          <option value="">Any seniority</option>
          {SENIORITY_LEVELS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select name="availability" defaultValue={sp.availability ?? ""}>
          <option value="">Any availability</option>
          {AVAILABILITY_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 px-1 text-sm text-slate-700">
          <input type="checkbox" name="stale" value="1" defaultChecked={sp.stale === "1"} /> Stale only
        </label>
        <button className={buttonClass("secondary")}>Filter</button>
        {sp.archived === "1" && <input type="hidden" name="archived" value="1" />}
      </form>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Experience</th>
              <th className="px-4 py-2.5 font-medium">Top skills</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const years = totalYears(r);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/resources/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.name}
                    </Link>
                    {r.seniority && <div className="text-xs text-slate-500">{r.seniority}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.title || <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-700">{years == null ? "—" : `${years} yrs`}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {r.skills.slice(0, 5).map((s) => (
                        <Badge key={`${s.category}-${s.name}`}>{s.name}</Badge>
                      ))}
                      {r.skills.length > 5 && <span className="text-xs text-slate-500">+{r.skills.length - 5}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700">{r.email}</div>
                    {!r.emailVerified && (
                      <Badge tone="amber" title="Generated sample address. No real emails are sent to it.">
                        sample / unverified
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{r.updatedAt.toLocaleDateString()}</div>
                    {isStale(r, env.staleAfterDays) && <Badge tone="red">stale</Badge>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No resources match. Try clearing the filters, or <Link href="/admin/import" className="text-brand underline">import your Google Form CSV</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-sm">
        {sp.archived === "1" ? (
          <Link href="/admin/resources" className="text-brand underline">
            Back to active resources
          </Link>
        ) : (
          <Link href="/admin/resources?archived=1" className="text-slate-500 underline">
            View archived resources
          </Link>
        )}
      </p>
    </>
  );
}
