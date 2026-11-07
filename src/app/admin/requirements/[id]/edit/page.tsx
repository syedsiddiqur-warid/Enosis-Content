import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { getRequirement, requirementInputSchema, skillVocabulary } from "@/lib/requirements";
import { RequirementForm } from "../../requirement-form";

export const dynamic = "force-dynamic";

export default async function EditRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const req = await getRequirement(db, id).catch(() => null);
  if (!req) notFound();
  const initial = requirementInputSchema.parse({ ...req, status: req.status });
  return (
    <>
      <PageHeader title={`Edit: ${req.roleTitle}`} />
      <RequirementForm id={req.id} initial={initial} vocabulary={await skillVocabulary(db)} />
    </>
  );
}
