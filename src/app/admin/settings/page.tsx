import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { getTemplate, TEMPLATE_DEFS } from "@/lib/notify/templates";
import { getAiSettings, getSettings } from "@/lib/settings";
import { AiSettingsForm } from "./ai-settings-form";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const db = await getDb();
  const settings = await getSettings(db);
  const aiSettings = await getAiSettings(db);
  const templates = await Promise.all(TEMPLATE_DEFS.map((t) => getTemplate(db, t.key)));

  return (
    <>
      <PageHeader title="Settings" description={`Email provider: ${env.emailProvider}${env.emailProvider === "dev" ? " (messages go to the dev inbox)" : ""}. Change it with EMAIL_PROVIDER.`} />
      {saved && <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Saved.</p>}

      <h2 className="mb-3 text-base font-semibold">Links and reminders</h2>
      <SettingsForm settings={settings} />

      <h2 className="mt-8 mb-3 text-base font-semibold">AI profile writing</h2>
      <AiSettingsForm settings={aiSettings} mode={env.aiMode} model={env.anthropicModel} />

      <h2 className="mt-8 mb-3 text-base font-semibold">Export</h2>
      <Card className="mb-2">
        <Link href="/admin/settings/canva" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-900">Canva and PDF export</div>
            <div className="text-xs text-slate-500">Connect Canva, choose the brand template, and map profile fields to it. The in-app PDF needs no setup.</div>
          </div>
          <span className="text-sm text-brand">Open →</span>
        </Link>
      </Card>

      <h2 className="mt-8 mb-3 text-base font-semibold">Messages</h2>
      <Card className="divide-y divide-slate-100">
        {templates.map((t) => (
          <Link key={t.key} href={`/admin/settings/templates/${t.key}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">{t.name}</div>
              <div className="text-xs text-slate-500">{t.description}</div>
            </div>
            {t.customized ? <Badge tone="brand">edited</Badge> : <Badge>default</Badge>}
          </Link>
        ))}
      </Card>
    </>
  );
}
