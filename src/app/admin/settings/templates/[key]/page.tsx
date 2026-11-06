import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { getTemplate, TEMPLATE_DEFS, type TemplateKey } from "@/lib/notify/templates";
import { resetTemplateAction } from "../../actions";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!TEMPLATE_DEFS.some((t) => t.key === key)) notFound();
  const t = await getTemplate(await getDb(), key as TemplateKey);

  return (
    <>
      <PageHeader
        title={t.name}
        description={
          <>
            {t.description} <Link href="/admin/settings" className="text-brand underline">Back to settings</Link>
          </>
        }
        actions={
          t.customized && (
            <form action={resetTemplateAction}>
              <input type="hidden" name="key" value={t.key} />
              <Button variant="secondary">Reset to default wording</Button>
            </form>
          )
        }
      />
      {t.updatedBy && (
        <p className="mb-4 text-xs text-slate-500">
          Last edited by {t.updatedBy} on {t.updatedAt?.toLocaleString()}
        </p>
      )}
      <TemplateEditor key={`${t.key}-${t.customized}-${t.updatedAt?.getTime() ?? 0}`} templateKey={t.key} subject={t.subject} body={t.body} variables={t.variables} />
    </>
  );
}
