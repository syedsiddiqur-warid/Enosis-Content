import { desc } from "drizzle-orm";
import Link from "next/link";
import { Badge, Button, Card, PageHeader, inputClass } from "@/components/ui";
import { getDb } from "@/db";
import { importBatches } from "@/db/schema";
import { uploadCsvAction } from "./actions";

export const dynamic = "force-dynamic";

function UploadCard({ kind, title, children }: { kind: "resources" | "emails"; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1 mb-4 space-y-2 text-sm text-slate-600">{children}</div>
      <form action={uploadCsvAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="file" name="file" accept=".csv,text/csv" required className={`${inputClass} flex-1 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium`} />
        <Button type="submit">Upload</Button>
      </form>
    </Card>
  );
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await getDb();
  const batches = await db
    .select({
      id: importBatches.id,
      kind: importBatches.kind,
      filename: importBatches.filename,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      createdBy: importBatches.createdBy,
    })
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(20);

  return (
    <>
      <PageHeader title="Import" description="Bring in data from our Google Form, and later load the real email list." />
      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <UploadCard kind="resources" title="1. Resources from the Google Form">
          <p>
            In the Google Sheet, choose <b>File → Download → Comma-separated values (.csv)</b> for the &quot;Form Responses 1&quot; tab, then upload it here.
          </p>
          <p>You&apos;ll review the column mapping and a preview before anything is saved. If someone submitted the form more than once, only their latest answer is used.</p>
        </UploadCard>
        <UploadCard kind="emails" title="2. Real email addresses">
          <p>
            A CSV with a <b>Name</b> column and an <b>Email</b> column. Each row is matched to a resource by name and replaces the sample address. Imported addresses are marked verified.
          </p>
          <p>
            Until then, resources get sample addresses like <code className="text-xs">firstname.lastname@enosisbd.com</code>, and no real emails are sent to them.
          </p>
        </UploadCard>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold">Recent imports</h2>
      <Card className="divide-y divide-slate-100">
        {batches.length === 0 && <p className="p-4 text-sm text-slate-500">No imports yet.</p>}
        {batches.map((b) => (
          <Link key={b.id} href={`/admin/import/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
            <span className="font-medium text-slate-800">{b.filename}</span>
            <Badge tone="brand">{b.kind === "emails" ? "emails" : "resources"}</Badge>
            <Badge tone={b.status === "applied" ? "green" : "amber"}>{b.status}</Badge>
            <span className="ml-auto text-slate-500">
              {b.createdAt.toLocaleString()} · {b.createdBy}
            </span>
          </Link>
        ))}
      </Card>
    </>
  );
}
