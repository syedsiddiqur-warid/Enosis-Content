import type { ReactNode } from "react";
import { Card } from "./ui";

/** Shell for pages opened from a secure link: friendly, minimal, no admin navigation. */
export function LinkShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <p className="mb-4 text-center text-xs font-semibold tracking-wider text-brand uppercase">Enosis Solutions</p>
        {children}
      </div>
    </main>
  );
}

const MESSAGES = {
  invalid: {
    title: "We couldn't find this link",
    body: "The link may be incomplete. Please open it straight from the email we sent you, or reply to that email and we'll send a fresh one.",
  },
  expired: {
    title: "This link has expired",
    body: "For your security, links only work for a limited time. Please reply to our email and we'll gladly send you a new one.",
  },
  revoked: {
    title: "This link is no longer active",
    body: "A newer link may have been sent to you, so please check your inbox for our latest email. If you can't find it, just reply and we'll help.",
  },
  completed: {
    title: "All done, thank you!",
    body: "This request has already been completed. There's nothing more you need to do.",
  },
} as const;

export function LinkMessage({ state, name, senderName }: { state: keyof typeof MESSAGES; name?: string; senderName?: string }) {
  const m = MESSAGES[state];
  return (
    <LinkShell>
      <Card className="p-7 text-center">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">{state === "completed" && name ? `All done, thank you, ${name}!` : m.title}</h1>
        <p className="text-sm leading-relaxed text-slate-600">{m.body}</p>
        {senderName && <p className="mt-5 text-sm text-slate-500">— {senderName}</p>}
      </Card>
    </LinkShell>
  );
}
