"use client";

import { useActionState, useState } from "react";
import { TagInput } from "@/components/tag-input";
import { Button, Card, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import type { ProfileContent, ProfileProject } from "@/lib/profiles/types";
import { saveProfileEditAction } from "../actions";

/** A textarea edited as one item per line; keeps the raw text so blank lines don't vanish while typing. */
function LinesField({ label, hint, value, onChange, rows = 4 }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <Field label={label} hint={hint ?? "One per line."}>
      <Textarea
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function ProfileEditor({ profileId, initial, sourceProjects }: { profileId: string; initial: ProfileContent; sourceProjects: string[] }) {
  const [state, action, pending] = useActionState(saveProfileEditAction, null);
  const [c, setC] = useState(initial);
  const set = <K extends keyof ProfileContent>(k: K, v: ProfileContent[K]) => setC((p) => ({ ...p, [k]: v }));
  const setProject = (i: number, patch: Partial<ProfileProject>) => set("projects", c.projects.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="payload" value={JSON.stringify(c)} />

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={c.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Title">
            <Input value={c.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
        </div>
        <Field label={`Career summary (${words(c.careerSummary)} words)`}>
          <Textarea rows={4} value={c.careerSummary} onChange={(e) => set("careerSummary", e.target.value)} />
        </Field>
        <LinesField label="Core competency" value={c.coreCompetencies} onChange={(v) => set("coreCompetencies", v)} rows={5} />
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Technical expertise</h3>
        {c.technicalExpertise.map((row, i) => (
          <div key={i} className="grid items-start gap-2 sm:grid-cols-[12rem_1fr_auto]">
            <Input value={row.category} onChange={(e) => set("technicalExpertise", c.technicalExpertise.map((r, j) => (j === i ? { ...r, category: e.target.value } : r)))} />
            <TagInput value={row.items} onChange={(v) => set("technicalExpertise", c.technicalExpertise.map((r, j) => (j === i ? { ...r, items: v } : r)))} />
            <Button type="button" variant="ghost" onClick={() => set("technicalExpertise", c.technicalExpertise.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => set("technicalExpertise", [...c.technicalExpertise, { category: "", items: [] }])}>
          + Add category
        </Button>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">Education</h3>
        {c.education.map((e, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
            <Input value={e.degree} placeholder="Degree" onChange={(ev) => set("education", c.education.map((x, j) => (j === i ? { ...x, degree: ev.target.value } : x)))} />
            <Input value={e.institution} placeholder="Institution" onChange={(ev) => set("education", c.education.map((x, j) => (j === i ? { ...x, institution: ev.target.value } : x)))} />
            <Input value={e.year} placeholder="Year" onChange={(ev) => set("education", c.education.map((x, j) => (j === i ? { ...x, year: ev.target.value } : x)))} />
            <Button type="button" variant="ghost" onClick={() => set("education", c.education.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => set("education", [...c.education, { degree: "", institution: "", year: "" }])}>
          + Add education
        </Button>
        <LinesField label="Awards & certifications" value={c.awardsAndCertifications} onChange={(v) => set("awardsAndCertifications", v)} />
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Project engagements</h3>
        {c.projects.map((p, i) => (
          <div key={i} className="space-y-3 rounded-md border border-slate-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title (no client names)">
                <Input value={p.title} onChange={(e) => setProject(i, { title: e.target.value })} />
              </Field>
              <Field label="Industry">
                <Input value={p.industry} onChange={(e) => setProject(i, { industry: e.target.value })} />
              </Field>
              <Field label="Written from record project" hint="Used by the fact check; not shown in the profile.">
                <Select value={p.sourceProjectName} onChange={(e) => setProject(i, { sourceProjectName: e.target.value })}>
                  {!sourceProjects.includes(p.sourceProjectName) && <option value={p.sourceProjectName}>{p.sourceProjectName || "—"} (not in record)</option>}
                  {sourceProjects.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={`Description (${words(p.description)} words)`}>
              <Textarea rows={3} value={p.description} onChange={(e) => setProject(i, { description: e.target.value })} />
            </Field>
            <Field label="Core technologies">
              <TagInput value={p.coreTechnologies} onChange={(v) => setProject(i, { coreTechnologies: v })} />
            </Field>
            <LinesField label="Major contributions" value={p.contributions} onChange={(v) => setProject(i, { contributions: v })} rows={5} />
            <Button type="button" variant="ghost" onClick={() => set("projects", c.projects.filter((_, j) => j !== i))}>
              Remove project
            </Button>
          </div>
        ))}
        {sourceProjects.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => set("projects", [...c.projects, { title: "", industry: "", description: "", coreTechnologies: [], contributions: [], sourceProjectName: sourceProjects[0] }])}
          >
            + Add project
          </Button>
        )}
      </Card>

      {state?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-[#f6f7f9]/95 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save as new version"}
        </Button>
        <a href={`/admin/profiles/${profileId}`} className={buttonClass("secondary")}>
          Cancel
        </a>
      </div>
    </form>
  );
}
