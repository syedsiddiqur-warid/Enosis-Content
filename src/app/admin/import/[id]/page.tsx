import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, PageHeader, Select, buttonClass } from "@/components/ui";
import { getDb } from "@/db";
import { importBatches } from "@/db/schema";
import { TARGET_FIELDS } from "@/lib/import/google-form";
import { planEmailImport, planResourceImport } from "@/lib/import/resources-import";
import { applyImportAction, saveMappingAction } from "../actions";

export const dynamic = "force-dynamic";

function shortHeader(h: string) {
  const first = h.split("\n")[0].trim();
  return first.length > 70 ? `${first.slice(0, 67)}…` : first;
}

/** 0 → A, 25 → Z, 26 → AA, matching the spreadsheet's column letters. */
function columnLetter(i: number): string {
  return (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
}

function Summary({ summary }: { summary: Record<string, number> }) {
  return (
    <Card className="mb-5 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="font-medium">Import applied.</p>
      <p className="mt-1">
        {Object.entries(summary)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}
      </p>
      <Link href="/admin/resources" className="mt-2 inline-block font-medium underline">
        View resources
      </Link>
    </Card>
  );
}

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const { step } = await searchParams;
  const db = await getDb();
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, id))
    .catch(() => []);
  if (!batch) notFound();
  const applied = batch.status === "applied";

  // Applied imports show what actually happened, not a fresh plan against today's data.
  if (applied) {
    return (
      <>
        <PageHeader title={`Imported: ${batch.filename}`} description={`Applied ${batch.appliedAt?.toLocaleString()} by ${batch.createdBy}`} />
        {batch.summary && <Summary summary={batch.summary} />}
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Row</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Outcome</th>
                <th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(batch.results ?? []).map((r) => (
                <tr key={r.rowNumber}>
                  <td className="px-4 py-2 text-slate-500">{r.rowNumber}</td>
                  <td className="px-4 py-2">
                    {r.resourceId ? (
                      <Link href={`/admin/resources/${r.resourceId}`} className="text-brand hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={["create", "updated", "update"].includes(r.outcome) ? "green" : "neutral"}>{r.outcome}</Badge>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  // ---- Email list import ----
  if (batch.kind === "emails") {
    if (!batch.mapping) {
      return (
        <>
          <PageHeader title={batch.filename} />
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            Couldn&apos;t find a Name column and an Email column in this file. Please check the headers and upload again.
          </p>
        </>
      );
    }
    const plan = await planEmailImport(db, batch.rows, { name: batch.mapping.name, email: batch.mapping.email });
    const tones = { update: "green", unchanged: "neutral", no_match: "amber", invalid_email: "red", email_in_use: "red" } as const;
    const labels = { update: "will update", unchanged: "already set", no_match: "no matching resource", invalid_email: "invalid email", email_in_use: "email used by someone else" };
    return (
      <>
        <PageHeader title={`Email update: ${batch.filename}`} description={`${plan.length} rows`} />
        <Card className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Row</th>
                <th className="px-4 py-2">Name in file</th>
                <th className="px-4 py-2">Matched resource</th>
                <th className="px-4 py-2">Current email</th>
                <th className="px-4 py-2">New email</th>
                <th className="px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.map((p) => (
                <tr key={p.rowNumber}>
                  <td className="px-4 py-2 text-slate-500">{p.rowNumber}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.resource?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{p.resource?.email ?? "—"}</td>
                  <td className="px-4 py-2">{p.email}</td>
                  <td className="px-4 py-2">
                    <Badge tone={tones[p.status]}>{labels[p.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <form action={applyImportAction}>
          <input type="hidden" name="id" value={batch.id} />
          <Button disabled={!plan.some((p) => p.status === "update")}>Update {plan.filter((p) => p.status === "update").length} emails</Button>
        </form>
      </>
    );
  }

  // ---- Resource import: step 1, column mapping ----
  const mapping = batch.mapping ?? {};
  if (step !== "preview") {
    const groups = [...new Set(TARGET_FIELDS.map((f) => f.group))];
    return (
      <>
        <PageHeader
          title={`Map columns: ${batch.filename}`}
          description={`${batch.rows.length} rows, ${batch.headers.length} columns. Columns were matched automatically from our Google Form headers; check them and adjust if needed.`}
        />
        <form action={saveMappingAction} className="space-y-5">
          <input type="hidden" name="id" value={batch.id} />
          {groups.map((group) => (
            <Card key={group} className="p-5">
              <h2 className="mb-3 text-base font-semibold">{group}</h2>
              <div className="grid gap-x-5 gap-y-3 md:grid-cols-2">
                {TARGET_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
                      {f.label}
                      {mapping[f.key] === undefined && <Badge tone="amber">not mapped</Badge>}
                    </span>
                    <Select name={`map.${f.key}`} defaultValue={mapping[f.key] === undefined ? "" : String(mapping[f.key])}>
                      <option value="">— Not in this file —</option>
                      {batch.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {columnLetter(i)} · {shortHeader(h)}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </Card>
          ))}
          <div className="flex gap-2">
            <Button type="submit">Preview import</Button>
            <Link href="/admin/import" className={buttonClass("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </>
    );
  }

  // ---- Resource import: step 2, preview / result ----
  const { planned, missingName, counts } = await planResourceImport(db, batch.rows, mapping);
  const actionTone = { create: "green", update: "brand", skip: "neutral" } as const;

  return (
    <>
      <PageHeader
        title={`Preview: ${batch.filename}`}
        description={`${counts.rows} rows → ${counts.people} people. ${counts.create} new, ${counts.update} to update, ${counts.skip} skipped, ${counts.duplicates} older duplicate submissions ignored.`}
        actions={
          <Link href={`/admin/import/${batch.id}`} className={buttonClass("secondary")}>
              Back to mapping
            </Link>
        }
      />
      {counts.create > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          New resources get a sample address like <code>firstname.lastname@enosisbd.com</code>, marked unverified. No real emails are sent to them until you load the real
          email list.
        </p>
      )}
      {missingName.length > 0 && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {missingName.length} row(s) have no name and will be skipped (rows {missingName.map((m) => m.rowNumber).join(", ")}).
        </p>
      )}

      <Card className="mb-5 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Person</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Experience</th>
              <th className="px-4 py-2">Parsed</th>
              <th className="px-4 py-2">Projects</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {planned.map((p) => (
              <tr key={p.rowNumber}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    Row {p.rowNumber}
                    {p.timestamp > 0 && ` · ${new Date(p.timestamp).toLocaleDateString()}`}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={actionTone[p.action]}>{p.action}</Badge>
                  {p.existing && (
                    <Link href={`/admin/resources/${p.existing.id}`} className="mt-1 block text-xs text-brand underline">
                      existing record
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                  {p.yearsPrevious ?? 0} prev + {p.yearsEnosis ?? 0} Enosis
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {p.skills.length} skills · {p.education.length} education · {p.achievements.length} achievements
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {p.projects.map((proj, i) => (
                    <div key={i}>
                      {proj.name}
                      {proj.type && <span className="text-slate-500"> ({proj.type})</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {p.reason && <div className="text-slate-800">{p.reason}</div>}
                  {p.duplicatesDropped > 0 && <div>{p.duplicatesDropped} older submission(s) ignored</div>}
                  {p.warnings.map((w) => (
                    <div key={w} className="text-amber-800">
                      {w}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <form action={applyImportAction} className="flex items-center gap-3">
          <input type="hidden" name="id" value={batch.id} />
          <Button disabled={counts.create + counts.update === 0}>
            Import {counts.create + counts.update} {counts.create + counts.update === 1 ? "person" : "people"}
          </Button>
          <span className="text-sm text-slate-500">Updated records keep their previous version in the history.</span>
        </form>
    </>
  );
}
