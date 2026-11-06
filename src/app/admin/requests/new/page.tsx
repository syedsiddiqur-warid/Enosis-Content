import { inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { resources } from "@/db/schema";
import { env } from "@/lib/env";
import { addDaysIso } from "@/lib/links/service";
import { getTemplate } from "@/lib/notify/templates";
import { getSettings } from "@/lib/settings";
import { SendRequestForm } from "./send-form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = (Array.isArray(sp.ids) ? sp.ids : (sp.ids ?? "").split(",")).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const db = await getDb();
  const people = ids.length ? await db.select().from(resources).where(inArray(resources.id, ids)).orderBy(resources.name) : [];
  const settings = await getSettings(db);
  const template = await getTemplate(db, "resource_update_request");

  if (people.length === 0) {
    return (
      <>
        <PageHeader title="Send update request" />
        <p className="text-sm text-slate-600">
          No resources selected. Choose people on the <Link href="/admin/resources" className="text-brand underline">Resources</Link> page first.
        </p>
      </>
    );
  }

  const unverified = people.filter((p) => !p.emailVerified);
  const devMode = env.emailProvider === "dev";

  return (
    <>
      <PageHeader
        title="Send update request"
        description={`Each person gets their own secure link, valid for ${settings.resourceLinkDays} days (or until the due date if later). Any earlier open request for them is revoked.`}
      />

      <Card className="mb-5 p-4">
        <p className="mb-2 text-sm font-medium">Recipients ({people.length})</p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {people.map((p) => (
            <li key={p.id} className="rounded-md border border-slate-200 px-2.5 py-1">
              {p.name} <span className="text-slate-500">· {p.email}</span> {!p.emailVerified && <Badge tone="amber">sample</Badge>}
            </li>
          ))}
        </ul>
        {unverified.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900">
            {devMode
              ? `${unverified.length} ${unverified.length === 1 ? "person has" : "people have"} a sample email. In development their message goes to the dev inbox only.`
              : `${unverified.length} ${unverified.length === 1 ? "person has" : "people have"} a sample email and will be skipped. Add their real email first.`}
          </p>
        )}
      </Card>

      <SendRequestForm
        ids={people.map((p) => p.id)}
        firstRecipient={people[0].name}
        defaultDueDate={addDaysIso(Math.max(1, settings.resourceLinkDays - 2))}
        minDate={addDaysIso(0)}
        template={{ subject: template.subject, body: template.body }}
        senderName={settings.senderName}
      />
    </>
  );
}
