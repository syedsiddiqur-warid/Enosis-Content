import { PageHeader } from "@/components/ui";
import { ResourceForm, emptyResource } from "@/components/resource-form";

export default function NewResourcePage() {
  return (
    <>
      <PageHeader title="New resource" />
      <ResourceForm initial={emptyResource} />
    </>
  );
}
