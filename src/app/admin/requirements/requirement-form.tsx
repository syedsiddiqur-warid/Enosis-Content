"use client";

import { useActionState, useState } from "react";
import { TagInput } from "@/components/tag-input";
import { Button, Card, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { numberOrNull } from "@/components/profile-editors";
import { findSkillsInText } from "@/lib/matching";
import { ENGAGEMENT_TYPES, REQUIREMENT_STATUSES, type RequirementInput } from "@/lib/requirement-types";
import { saveRequirementAction } from "./actions";

export const emptyRequirement: RequirementInput = {
  clientName: "",
  roleTitle: "",
  mustHaveSkills: [],
  niceToHaveSkills: [],
  minYears: null,
  domain: "",
  engagementType: "",
  deadline: null,
  notes: "",
  status: "open",
};

export function RequirementForm({ id, initial, vocabulary }: { id?: string; initial: RequirementInput; vocabulary: string[] }) {
  const [state, action, pending] = useActionState(saveRequirementAction, null);
  const [r, setR] = useState(initial);
  const [found, setFound] = useState<string[] | null>(null);
  const set = <K extends keyof RequirementInput>(k: K, v: RequirementInput[K]) => setR((p) => ({ ...p, [k]: v }));

  const already = new Set([...r.mustHaveSkills, ...r.niceToHaveSkills].map((s) => s.toLowerCase()));
  const suggestions = (found ?? []).filter((s) => !already.has(s.toLowerCase()));

  return (
    <form action={action} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="payload" value={JSON.stringify(r)} />
      <datalist id="skill-vocabulary">
        {vocabulary.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / prospect">
            <Input value={r.clientName} onChange={(e) => set("clientName", e.target.value)} required placeholder="Acme Health Inc." />
          </Field>
          <Field label="Role title">
            <Input value={r.roleTitle} onChange={(e) => set("roleTitle", e.target.value)} required placeholder="Senior .NET Engineer" />
          </Field>
          <Field label="Domain / industry">
            <Input value={r.domain} onChange={(e) => set("domain", e.target.value)} placeholder="Healthcare" />
          </Field>
          <Field label="Engagement type">
            <Select value={r.engagementType} onChange={(e) => set("engagementType", e.target.value)}>
              <option value="">Not set</option>
              {ENGAGEMENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum experience (years)">
            <Input type="number" min={0} step={0.5} value={r.minYears ?? ""} onChange={(e) => set("minYears", numberOrNull(e.target.value))} />
          </Field>
          <Field label="Deadline">
            <Input type="date" value={r.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
          </Field>
          {id && (
            <Field label="Status">
              <Select value={r.status} onChange={(e) => set("status", e.target.value as RequirementInput["status"])}>
                {REQUIREMENT_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <Field label="Must-have skills" hint="Type and press Enter. Suggestions come from skills already in our database.">
          <TagInput value={r.mustHaveSkills} onChange={(v) => set("mustHaveSkills", v)} list="skill-vocabulary" placeholder="React, Node.js…" />
        </Field>
        <Field label="Nice-to-have skills">
          <TagInput value={r.niceToHaveSkills} onChange={(v) => set("niceToHaveSkills", v)} list="skill-vocabulary" placeholder="AWS, Docker…" />
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <Field label="Notes or pasted job description">
          <Textarea rows={8} value={r.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Paste the prospect's job description or add your own notes." />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setFound(findSkillsInText(r.notes, vocabulary))} disabled={!r.notes.trim()}>
            Find skills in this text
          </Button>
          {found && suggestions.length === 0 && <span className="text-sm text-slate-500">No new skills found.</span>}
        </div>
        {suggestions.length > 0 && (
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="mb-2 text-slate-600">Found in the text. Click to add:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <span key={s} className="inline-flex overflow-hidden rounded-full border border-slate-200 text-xs">
                  <span className="bg-slate-50 px-2 py-1">{s}</span>
                  <button type="button" className="cursor-pointer px-2 py-1 text-brand hover:bg-brand-soft" onClick={() => set("mustHaveSkills", [...r.mustHaveSkills, s])}>
                    must
                  </button>
                  <button type="button" className="cursor-pointer border-l border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => set("niceToHaveSkills", [...r.niceToHaveSkills, s])}>
                    nice
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {state?.errors && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </Card>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : id ? "Save requirement" : "Create and find matches"}
        </Button>
        <a href={id ? `/admin/requirements/${id}` : "/admin/requirements"} className={buttonClass("secondary")}>
          Cancel
        </a>
      </div>
    </form>
  );
}
