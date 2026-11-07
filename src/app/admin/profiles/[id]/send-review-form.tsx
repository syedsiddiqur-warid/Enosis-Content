"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { sendForReviewAction } from "../actions";

type Reviewer = { id: string; name: string; email: string; emailVerified: boolean };

export function SendReviewForm({
  profileId,
  reviewers,
  defaultReviewerId,
  defaultDue,
  minDate,
  highFlags,
  label,
}: {
  profileId: string;
  reviewers: Reviewer[];
  defaultReviewerId?: string;
  defaultDue: string;
  minDate: string;
  highFlags: number;
  label: string;
}) {
  const [state, action, pending] = useActionState(sendForReviewAction, null);
  const [choice, setChoice] = useState(defaultReviewerId ?? (reviewers[0]?.id ?? "new"));
  return (
    <form action={action} className="space-y-3 text-sm">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="hasHighFlags" value={highFlags ? "1" : "0"} />
      <Field label="Reviewer">
        <Select name="reviewerId" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {reviewers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.email}){r.emailVerified ? "" : " · sample email"}
            </option>
          ))}
          <option value="new">+ Someone new…</option>
        </Select>
      </Field>
      {choice === "new" && (
        <div className="grid gap-2">
          <Input name="newName" placeholder="Name" required />
          <Input name="newEmail" type="email" placeholder="name@enosisbd.com" required />
        </div>
      )}
      <Field label="Feedback by">
        <Input type="date" name="dueDate" defaultValue={defaultDue} min={minDate} required />
      </Field>
      {highFlags > 0 && (
        <label className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-900">
          <input type="checkbox" name="ackFlags" className="mt-0.5" />
          I&apos;ve checked the {highFlags} high-severity fact-check flag{highFlags > 1 ? "s" : ""}.
        </label>
      )}
      {state?.error && <p className="text-red-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : label}
      </Button>
    </form>
  );
}
