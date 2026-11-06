"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import type { Settings } from "@/lib/settings";
import { saveSettingsAction } from "./actions";

function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  return (
    <form action={action}>
      <Card className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" hint="Fills {sender_name} in messages.">
            <Input name="senderName" defaultValue={settings.senderName} required />
          </Field>
          <div />
          <Field label="Resource links last (days)">
            <Input type="number" name="resourceLinkDays" min={1} max={60} defaultValue={settings.resourceLinkDays} />
          </Field>
          <Field label="Reviewer links last (days)">
            <Input type="number" name="reviewerLinkDays" min={1} max={60} defaultValue={settings.reviewerLinkDays} />
          </Field>
          <Field label="Send reminder this many days before the due date">
            <Input type="number" name="reminderDaysBeforeDue" min={0} max={30} defaultValue={settings.reminderDaysBeforeDue} />
          </Field>
          <Field label="Maximum automatic reminders" hint="0 turns automatic reminders off.">
            <Input type="number" name="maxReminders" min={0} max={5} defaultValue={settings.maxReminders} />
          </Field>
        </div>
        <Toggle
          name="requireOtp"
          label="Require an email code before a link opens"
          hint="Extra security: the recipient gets a 6-digit code by email and enters it before seeing their page."
          defaultChecked={settings.requireOtp}
        />
        <Toggle
          name="sendThankYouEmail"
          label="Email a thank-you after a resource submits"
          hint="The thank-you message is always shown on screen."
          defaultChecked={settings.sendThankYouEmail}
        />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </Card>
    </form>
  );
}
