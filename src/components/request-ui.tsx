import { remindAction, resendAction, revokeAction } from "@/app/admin/requests/actions";
import type { AccessRequestRow } from "@/db/schema";
import { requestStatus, type RequestStatus } from "@/lib/links/service";
import { Badge } from "./ui";

const STATUS: Record<RequestStatus, { label: string; tone: "neutral" | "brand" | "green" | "amber" | "red" }> = {
  sent: { label: "sent", tone: "neutral" },
  opened: { label: "opened", tone: "brand" },
  completed: { label: "completed", tone: "green" },
  expired: { label: "expired", tone: "amber" },
  revoked: { label: "revoked", tone: "red" },
};

export function RequestStatusBadge({ request }: { request: AccessRequestRow }) {
  const s = STATUS[requestStatus(request)];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const EMAIL_TONE = { sent: "green", dev_inbox: "brand", blocked: "red", failed: "red" } as const;

export function EmailStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <Badge tone={EMAIL_TONE[status as keyof typeof EMAIL_TONE] ?? "neutral"} title="Status of the latest email for this request">
      email: {status === "dev_inbox" ? "dev inbox" : status}
    </Badge>
  );
}

function ActionButton({ action, id, back, label, confirm }: { action: (f: FormData) => Promise<void>; id: string; back: string; label: string; confirm?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button
        className={`cursor-pointer rounded px-2 py-1 text-xs font-medium ${confirm ? "text-red-700 hover:bg-red-50" : "text-brand hover:bg-brand-soft"}`}
        title={label}
      >
        {label}
      </button>
    </form>
  );
}

/** Resend / remind / revoke controls for an open request. */
export function RequestActions({ request, back }: { request: AccessRequestRow; back: string }) {
  const status = requestStatus(request);
  if (status === "completed" || status === "revoked") return null;
  return (
    <div className="flex flex-wrap gap-1">
      <ActionButton action={resendAction} id={request.id} back={back} label={status === "expired" ? "Resend (new link)" : "Resend"} />
      {status !== "expired" && <ActionButton action={remindAction} id={request.id} back={back} label="Remind" />}
      {status !== "expired" && <ActionButton action={revokeAction} id={request.id} back={back} label="Revoke" confirm />}
    </div>
  );
}
