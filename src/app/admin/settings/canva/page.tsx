import Link from "next/link";
import { Badge, Button, Card, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { CANVA_SCOPES, CanvaError, canvaConfigured, getCanvaMapping, getConnection, listBrandTemplates, type BrandTemplate } from "@/lib/export/canva";
import { PROFILE_FIELDS } from "@/lib/export/fields";
import { findBrowser } from "@/lib/export/html-pdf";
import { disconnectCanvaAction, saveFieldMappingAction, selectTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

type Search = { q?: string; error?: string; connected?: string; saved?: string; disconnected?: string };

export default async function CanvaSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const db = await getDb();
  const configured = canvaConfigured();
  const connection = configured ? await getConnection(db) : null;
  const mapping = await getCanvaMapping(db);
  const browser = findBrowser();

  let templates: BrandTemplate[] = [];
  let listError: string | null = null;
  if (connection) {
    try {
      templates = await listBrandTemplates(db, sp.q);
    } catch (err) {
      listError = err instanceof CanvaError ? err.message : "Couldn't load brand templates.";
    }
  }
  const notice = sp.connected ? "Canva connected." : sp.saved === "template" ? "Template selected. Check the field mapping below." : sp.saved === "mapping" ? "Mapping saved." : sp.disconnected ? "Canva disconnected." : null;

  return (
    <>
      <PageHeader
        title="Canva and PDF export"
        description={
          <Link href="/admin/settings" className="text-brand underline">
            Back to settings
          </Link>
        }
      />
      {notice && <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {sp.error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{sp.error === "state" ? "The Canva sign-in expired or was already used. Please try again." : sp.error === "not_configured" ? "Set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET first." : sp.error}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 text-sm">
          <h2 className="mb-2 text-base font-semibold">In-app PDF</h2>
          <p className="text-slate-600">Always available as the fallback. It prints the same template the reviewer saw to an A4 PDF with the www.enosisbd.com footer on every page.</p>
          <p className="mt-2">{browser ? <Badge tone="green">ready · {browser.split(/[\\/]/).pop()}</Badge> : <Badge tone="red">no Chrome or Edge found; set CHROME_PATH</Badge>}</p>
        </Card>

        <Card className="p-5 text-sm">
          <h2 className="mb-2 text-base font-semibold">Canva connection</h2>
          {!configured ? (
            <p className="text-amber-900">Not set up. Add CANVA_CLIENT_ID and CANVA_CLIENT_SECRET to .env (see the requirements below), then restart.</p>
          ) : connection ? (
            <div className="space-y-2">
              <p>
                <Badge tone="green">connected</Badge> by {connection.connectedBy} on {connection.connectedAt.toLocaleDateString()}
              </p>
              <form action={disconnectCanvaAction}>
                <Button variant="secondary">Disconnect</Button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-slate-600">Sign in with the Canva account that owns your brand templates.</p>
              <a href="/api/canva/connect" className={buttonClass("primary")}>
                Connect Canva
              </a>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5 text-sm">
        <h2 className="mb-2 text-base font-semibold">What Canva export needs</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>
            A Canva <b>Connect API integration</b>, created in the Canva Developer Portal (Your integrations). Put its Client ID and secret in CANVA_CLIENT_ID and CANVA_CLIENT_SECRET.
          </li>
          <li>
            Its <b>redirect URL</b> set to <code className="rounded bg-slate-100 px-1">{env.canvaRedirectUri}</code> (CANVA_REDIRECT_URI). Canva wants <code>127.0.0.1</code> rather than <code>localhost</code> for local development.
          </li>
          <li>
            These <b>scopes</b> enabled on the integration: <code className="text-xs">{CANVA_SCOPES.join(", ")}</code>.
          </li>
          <li>
            The connected Canva user on <b>Canva Pro, Teams, or Enterprise</b>. Brand templates and autofill aren&apos;t available on free accounts.
          </li>
          <li>
            A <b>brand template with data fields</b>: in Canva, open the profile design, use <i>Bulk create</i> or <i>Data autofill</i> to name the text fields (e.g. <code>name</code>, <code>career_summary</code>, <code>project1_title</code>), and publish it as a brand template.
          </li>
          <li>Only text fields are filled. Image and chart fields in the template are left as they are.</li>
          <li>Canva download links expire after 24 hours, so the app downloads the PDF straight away and keeps it. The Canva design link stays valid for 30 days.</li>
        </ul>
      </Card>

      {connection && (
        <Card className="mt-5 p-5 text-sm">
          <h2 className="mb-3 text-base font-semibold">Brand template</h2>
          {mapping.brandTemplateId && (
            <p className="mb-3">
              Using <b>{mapping.brandTemplateTitle || mapping.brandTemplateId}</b>.
            </p>
          )}
          <form className="mb-3 flex gap-2">
            <Input name="q" defaultValue={sp.q} placeholder="Search your brand templates" />
            <button className={buttonClass("secondary")}>Search</button>
          </form>
          {listError && <p className="text-red-700">{listError}</p>}
          {!listError && templates.length === 0 && <p className="text-slate-500">No brand templates with data fields found.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <form key={t.id} action={selectTemplateAction} className="rounded-md border border-slate-200 p-3">
                <input type="hidden" name="templateId" value={t.id} />
                <input type="hidden" name="templateTitle" value={t.title} />
                {/* eslint-disable-next-line @next/next/no-img-element -- Canva thumbnail URLs are short-lived remote images */}
                {t.thumbnail?.url && <img src={t.thumbnail.url} alt="" className="mb-2 h-28 w-full rounded object-cover object-top" />}
                <p className="mb-2 font-medium">{t.title}</p>
                <Button variant={t.id === mapping.brandTemplateId ? "secondary" : "primary"} className="w-full">
                  {t.id === mapping.brandTemplateId ? "Selected · re-read fields" : "Use this template"}
                </Button>
              </form>
            ))}
          </div>
        </Card>
      )}

      {Object.keys(mapping.fields).length > 0 && (
        <Card className="mt-5 p-5 text-sm">
          <h2 className="mb-1 text-base font-semibold">Field mapping</h2>
          <p className="mb-3 text-slate-600">Choose which part of the profile fills each field of the template. Fields we recognized by name are pre-filled.</p>
          <form action={saveFieldMappingAction} className="space-y-2">
            {Object.entries(mapping.fields).map(([name, key]) => {
              const type = mapping.fieldTypes[name] ?? "text";
              return (
                <div key={name} className="grid items-center gap-2 sm:grid-cols-[14rem_1fr]">
                  <div>
                    <code className="text-xs">{name}</code> <span className="text-xs text-slate-400">{type}</span>
                  </div>
                  {type === "text" ? (
                    <Select name={`map.${name}`} defaultValue={key}>
                      <option value="">— Leave as in the template —</option>
                      {PROFILE_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="text-xs text-slate-500">Not filled ({type} fields aren&apos;t supported).</p>
                  )}
                </div>
              );
            })}
            <Button type="submit" className="mt-2">
              Save mapping
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
