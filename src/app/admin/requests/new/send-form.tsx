"use client";

import { useActionState, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { sendUpdateRequestsAction } from "../actions";

type Props = {
  ids: string[];
  firstRecipient: string;
  defaultDueDate: string;
  minDate: string;
  template: { subject: string; body: string };
  senderName: string;
};

function formatDue(date: string) {
  if (!date) return "{due_date}";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function fillPreview(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] || m);
}

export function SendRequestForm({ ids, firstRecipient, defaultDueDate, minDate, template, senderName }: Props) {
  const [state, action, pending] = useActionState(sendUpdateRequestsAction, null);
  const [roleTitle, setRoleTitle] = useState("");
  const [clientIndustry, setClientIndustry] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);

  const vars = {
    name: firstRecipient.split(" ")[0],
    role_title: roleTitle,
    client_industry: clientIndustry,
    due_date: formatDue(dueDate),
    link: "https://…/r/••••••••  (a unique secure link for each person)",
    sender_name: senderName,
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={action} className="space-y-4">
        {ids.map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <Card className="space-y-4 p-5">
          <Field label="Role title" hint='Used in the message: "an exciting opportunity for a … role".'>
            <Input name="roleTitle" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Senior .NET Engineer" required />
          </Field>
          <Field label="Client industry (optional)">
            <Input name="clientIndustry" value={clientIndustry} onChange={(e) => setClientIndustry(e.target.value)} placeholder="Healthcare" />
          </Field>
          <Field label="Please complete by">
            <Input type="date" name="dueDate" value={dueDate} min={minDate} onChange={(e) => setDueDate(e.target.value)} required />
          </Field>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          <Button type="submit" disabled={pending || !roleTitle.trim()}>
            {pending ? "Sending…" : `Send to ${ids.length} ${ids.length === 1 ? "person" : "people"}`}
          </Button>
        </Card>
      </form>

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Preview for {firstRecipient}</p>
        <p className="mb-3 text-sm font-semibold">{fillPreview(template.subject, vars)}</p>
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{fillPreview(template.body, vars)}</pre>
      </Card>
    </div>
  );
}
