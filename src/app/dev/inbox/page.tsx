import { desc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { outboundEmails } from "@/db/schema";
import { devInboxEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

const LINK_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(LINK_RE).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} className="break-all text-brand underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Local-only mailbox: every message the app "sends" in dev mode lands here. */
export default async function DevInboxPage() {
  if (!devInboxEnabled) notFound();
  const db = await getDb();
  const emails = await db.select().from(outboundEmails).orderBy(desc(outboundEmails.createdAt)).limit(50);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Dev inbox"
        description="EMAIL_PROVIDER=dev: nothing leaves this machine. Messages the app sends are shown here instead."
        actions={
          <Link href="/admin/resources" className="text-sm text-brand underline">
            Go to admin
          </Link>
        }
      />
      {emails.length === 0 && <p className="text-sm text-slate-600">No messages yet.</p>}
      <div className="space-y-3">
        {emails.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{e.subject}</span>
              <Badge tone={e.status === "dev_inbox" ? "brand" : e.status === "sent" ? "green" : "red"}>{e.status}</Badge>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              To {e.to} · {e.createdAt.toLocaleString()}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
              <Linkified text={e.text} />
            </pre>
          </Card>
        ))}
      </div>
    </main>
  );
}
