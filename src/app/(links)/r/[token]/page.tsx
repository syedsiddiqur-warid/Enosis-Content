import { LinkMessage, LinkShell } from "@/components/link-pages";
import { getDb } from "@/db";
import { firstName, formatDueDate } from "@/lib/links/service";
import { getFormState, UPDATE_STEPS } from "@/lib/links/update";
import { openLink } from "@/lib/links/visit";
import { getSettings } from "@/lib/settings";
import { OtpForm } from "../../otp-form";
import { UpdateForm } from "./update-form";

export const dynamic = "force-dynamic";

/** The resource's own update form, opened from their secure link. No login. */
export default async function ResourceLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const view = await openLink(db, token, "resource_update");
  const { senderName } = await getSettings(db);

  if (view.state === "invalid") return <LinkMessage state="invalid" senderName={senderName} />;
  const name = firstName(view.request.recipientName);
  if (view.state === "otp")
    return (
      <LinkShell>
        <OtpForm token={token} name={name} />
      </LinkShell>
    );
  if (view.state !== "open") return <LinkMessage state={view.state} name={name} senderName={senderName} />;

  const form = await getFormState(db, view.request);
  if (!form) return <LinkMessage state="invalid" senderName={senderName} />;

  return (
    <LinkShell wide>
      <UpdateForm
        token={token}
        steps={UPDATE_STEPS.map((s) => ({ key: s.key, title: s.title }))}
        base={form.base}
        initial={form.draft}
        savedAt={form.savedAt?.toISOString() ?? null}
        firstName={name}
        roleTitle={view.request.context.roleTitle}
        dueDate={view.request.dueDate ? formatDueDate(view.request.dueDate) : undefined}
      />
    </LinkShell>
  );
}
