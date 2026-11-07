import { LinkMessage, LinkShell } from "@/components/link-pages";
import { getDb } from "@/db";
import { firstName, formatDueDate } from "@/lib/links/service";
import { openLink } from "@/lib/links/visit";
import { sectionKeys, sectionLabel, sectionText, setSection } from "@/lib/profiles/sections";
import { getReviewForRequest } from "@/lib/reviews/service";
import { getSettings } from "@/lib/settings";
import { OtpForm } from "../../otp-form";
import { ReviewWorkspace, type Item } from "./review-workspace";

export const dynamic = "force-dynamic";

/** The reviewer's page, opened from their secure link: the formatted profile with inline edits and suggestions. */
export default async function ReviewLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const view = await openLink(db, token, "profile_review");
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

  const data = await getReviewForRequest(db, view.request);
  if (!data) return <LinkMessage state="invalid" senderName={senderName} />;
  const { review, items, base } = data;

  // Show each edit's section text before and after, for the side panel.
  const shown: Item[] = items.map((i) => ({
    id: i.id,
    kind: i.kind as Item["kind"],
    section: i.section,
    sectionLabel: i.sectionLabel,
    quote: i.quote,
    comment: i.comment,
    beforeText: i.kind === "edit" ? sectionText(setSection(base, i.section, i.before), i.section) : "",
    afterText: i.kind === "edit" ? sectionText(setSection(base, i.section, i.after), i.section) : "",
    createdAt: i.createdAt.toISOString(),
  }));
  const labels = Object.fromEntries(sectionKeys(review.workingContent).map((k) => [k, sectionLabel(review.workingContent, k)]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-center text-xs font-semibold tracking-wider text-brand uppercase">Enosis Solutions</p>
      <ReviewWorkspace
        token={token}
        working={review.workingContent}
        items={shown}
        reviewerName={view.request.recipientName}
        resourceName={view.request.context.resourceName ?? ""}
        roleTitle={view.request.context.roleTitle ?? ""}
        dueDate={view.request.dueDate ? formatDueDate(view.request.dueDate) : undefined}
        round={review.round}
        labels={labels}
      />
    </main>
  );
}
