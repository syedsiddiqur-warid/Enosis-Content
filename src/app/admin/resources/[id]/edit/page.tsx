import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ResourceForm } from "@/components/resource-form";
import { getDb } from "@/db";
import { getResource, toInput } from "@/lib/resources/service";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getResource(await getDb(), id).catch(() => null);
  if (!row) notFound();

  return (
    <>
      <PageHeader title={`Edit ${row.name}`} description="Saving keeps the previous version in the history." />
      <ResourceForm id={row.id} initial={toInput(row)} />
    </>
  );
}
