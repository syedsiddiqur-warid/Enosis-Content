"use client";

import { useActionState, useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { saveTemplateAction } from "../../actions";

const SAMPLE: Record<string, string> = {
  name: "Nadia",
  full_name: "Nadia Islam",
  reviewer_name: "Karim",
  resource_name: "Nadia Islam",
  role_title: "Senior Flutter Developer",
  client_industry: "FinTech",
  due_date: "Thursday, 12 November 2026",
  task: "please review your profile information",
  link: "https://talent.enosisbd.com/r/••••••••",
  sender_name: "Enosis Talent Team",
};

function fill(text: string) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => SAMPLE[k] ?? m);
}

export function TemplateEditor({ templateKey, subject: initialSubject, body: initialBody, variables }: { templateKey: string; subject: string; body: string; variables: string[] }) {
  const [state, action, pending] = useActionState(saveTemplateAction, null);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const unknown = [...`${subject} ${body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !variables.includes(v));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={action} className="space-y-4">
        <input type="hidden" name="key" value={templateKey} />
        <Card className="space-y-4 p-5">
          <Field label="Subject">
            <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea name="body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[13px]" />
          </Field>
          <div className="text-xs text-slate-600">
            Variables you can use:{" "}
            {variables.map((v) => (
              <code key={v} className="mr-1 rounded bg-slate-100 px-1 py-0.5">{`{${v}}`}</code>
            ))}
          </div>
          {unknown.length > 0 && <p className="text-xs text-amber-800">Not recognized, will be left as typed: {[...new Set(unknown)].map((u) => `{${u}}`).join(", ")}</p>}
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save message"}
          </Button>
        </Card>
      </form>
      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Preview with sample values</p>
        <p className="mb-3 text-sm font-semibold">{fill(subject)}</p>
        <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{fill(body)}</pre>
      </Card>
    </div>
  );
}
