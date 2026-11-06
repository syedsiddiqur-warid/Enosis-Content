"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button, Card, Input } from "@/components/ui";
import { otpAction } from "./actions";

export function OtpForm({ token, name }: { token: string; name: string }) {
  const [state, action, pending] = useActionState(otpAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.verified) router.refresh();
  }, [state?.verified, router]);

  return (
    <Card className="p-7">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">Hi {name}, one quick step</h1>
      {!state?.sentTo ? (
        <form action={action} className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">To keep your information safe, we&apos;ll email you a 6-digit code before opening this page.</p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="step" value="send" />
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form action={action} className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">We sent a code to {state.sentTo}. It expires in 10 minutes.</p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="step" value="verify" />
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" required autoFocus className="text-center text-lg tracking-[0.4em]" />
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      )}
    </Card>
  );
}
