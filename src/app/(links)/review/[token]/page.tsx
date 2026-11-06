import { LinkMessage, LinkShell } from "@/components/link-pages";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { firstName } from "@/lib/links/service";
import { openLink } from "@/lib/links/visit";
import { getSettings } from "@/lib/settings";
import { OtpForm } from "../../otp-form";

export const dynamic = "force-dynamic";

/** Reviewer page, opened from the secure link. The formatted profile and editing arrive in phase 6. */
export default async function ReviewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const view = await openLink(db, token, "profile_review");
  const { senderName } = await getSettings(db);

  if (view.state === "invalid") return <LinkMessage state="invalid" senderName={senderName} />;
  const name = firstName(view.request.recipientName);
  if (view.state !== "open" && view.state !== "otp") return <LinkMessage state={view.state} name={name} senderName={senderName} />;
  if (view.state === "otp")
    return (
      <LinkShell>
        <OtpForm token={token} name={name} />
      </LinkShell>
    );

  return (
    <LinkShell>
      <Card className="p-7 text-center">
        <h1 className="mb-2 text-xl font-semibold">Hi {name}!</h1>
        <p className="text-sm text-slate-600">The profile review page will appear here.</p>
      </Card>
    </LinkShell>
  );
}
