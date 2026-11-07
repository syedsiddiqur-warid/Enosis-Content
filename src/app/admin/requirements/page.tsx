import Link from "next/link";
import { Badge, Card, PageHeader, buttonClass } from "@/components/ui";
import { getDb } from "@/db";
import { formatDueDate } from "@/lib/links/service";
import { REQUIREMENT_STATUSES, listRequirements } from "@/lib/requirements";

export const dynamic = "force-dynamic";

const STATUS_TONE = { open: "brand", submitted: "amber", won: "green", lost: "red", closed: "neutral" } as const;

export default async function RequirementsPage() {
  const rows = await listRequirements(await getDb());

  return (
    <>
      <PageHeader
        title="Requirements"
        description="Staffing requests from prospects. Open one to see ranked matches and choose who to propose."
        actions={
          <Link href="/admin/requirements/new" className={buttonClass("primary")}>
            + New requirement
          </Link>
        }
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Must-have skills</th>
              <th className="px-4 py-2.5 font-medium">Deadline</th>
              <th className="px-4 py-2.5 font-medium">Proposed</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ requirement: r, candidates }) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/requirements/${r.id}`} className="font-medium text-brand hover:underline">
                    {r.roleTitle}
                  </Link>
                  {r.minYears != null && <div className="text-xs text-slate-500">{r.minYears}+ years</div>}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {r.clientName}
                  {r.domain && <div className="text-xs text-slate-500">{r.domain}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex max-w-72 flex-wrap gap-1">
                    {r.mustHaveSkills.slice(0, 5).map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                    {r.mustHaveSkills.length > 5 && <span className="text-xs text-slate-500">+{r.mustHaveSkills.length - 5}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.deadline ? formatDueDate(r.deadline) : "—"}</td>
                <td className="px-4 py-3 text-slate-700">{candidates}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{REQUIREMENT_STATUSES.find((s) => s.key === r.status)?.label ?? r.status}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No requirements yet. <Link href="/admin/requirements/new" className="text-brand underline">Create the first one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
