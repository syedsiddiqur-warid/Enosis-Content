import { PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { skillVocabulary } from "@/lib/requirements";
import { RequirementForm, emptyRequirement } from "../requirement-form";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage() {
  const vocabulary = await skillVocabulary(await getDb());
  return (
    <>
      <PageHeader title="New requirement" description="Describe what the prospect needs. You'll see ranked matches right after saving." />
      <RequirementForm initial={emptyRequirement} vocabulary={vocabulary} />
    </>
  );
}
