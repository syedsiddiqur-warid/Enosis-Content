"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { requestLinkAction } from "./actions";

export function LoginForm({ devInbox }: { devInbox: boolean }) {
  const [state, action, pending] = useActionState(requestLinkAction, null);

  if (state && "sent" in state) {
    return (
      <div className="space-y-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Check your email</p>
        <p>If this address is allowed to sign in, a sign-in link is on its way. The link works once and expires in 15 minutes.</p>
        {devInbox && (
          <p className="rounded-md bg-amber-50 p-3 text-amber-900">
            Development mode: open the <a className="font-medium underline" href="/dev/inbox">dev inbox</a> to find the link.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Work email">
        <Input name="email" type="email" required autoComplete="email" placeholder="you@enosisbd.com" autoFocus />
      </Field>
      {state && "error" in state && <p className="text-sm text-red-700">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
