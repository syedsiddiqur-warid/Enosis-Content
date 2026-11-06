"use client";

import { useActionState, useState, type ReactNode } from "react";
import { saveResourceAction } from "@/app/admin/resources/actions";
import { AchievementsEditor, EducationEditor, ProjectsEditor, SkillsEditor, numberOrNull } from "./profile-editors";
import { TagInput } from "./tag-input";
import { Button, Card, Field, Input, Select, Textarea, buttonClass } from "./ui";
import { AVAILABILITY_STATUSES, SENIORITY_LEVELS, type ResourceInput } from "@/lib/resources/types";

export const emptyResource: ResourceInput = {
  name: "",
  email: "",
  emailVerified: false,
  title: "",
  seniority: "",
  yearsPrevious: null,
  yearsEnosis: null,
  availabilityStatus: "unknown",
  availableFrom: null,
  majorExpertise: "",
  domains: [],
  languages: [],
  skills: [],
  education: [],
  achievements: [],
  projects: [],
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export function ResourceForm({ id, initial }: { id?: string; initial: ResourceInput }) {
  const [state, formAction, pending] = useActionState(saveResourceAction, null);
  const [r, setR] = useState<ResourceInput>(initial);
  const set = <K extends keyof ResourceInput>(key: K, value: ResourceInput[K]) => setR((prev) => ({ ...prev, [key]: value }));

  return (
    <form action={formAction} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="payload" value={JSON.stringify(r)} />

      <Section title="Personal details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={r.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Title" hint='As shown on the profile, e.g. "Senior Software Engineer"'>
            <Input value={r.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Email" hint="The secure update link is sent here.">
            <Input type="email" value={r.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
          <Field label="Email status">
            <Select value={r.emailVerified ? "verified" : "sample"} onChange={(e) => set("emailVerified", e.target.value === "verified")}>
              <option value="sample">Sample / unverified (no real emails sent)</option>
              <option value="verified">Verified (real address)</option>
            </Select>
          </Field>
          <Field label="Seniority">
            <Select value={r.seniority} onChange={(e) => set("seniority", e.target.value)}>
              <option value="">Not set</option>
              {SENIORITY_LEVELS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Experience and expertise">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Years at previous workplaces">
            <Input type="number" step="0.5" min="0" value={r.yearsPrevious ?? ""} onChange={(e) => set("yearsPrevious", numberOrNull(e.target.value))} />
          </Field>
          <Field label="Years at Enosis">
            <Input type="number" step="0.5" min="0" value={r.yearsEnosis ?? ""} onChange={(e) => set("yearsEnosis", numberOrNull(e.target.value))} />
          </Field>
          <Field label="Total" hint="Calculated">
            <Input value={r.yearsPrevious == null && r.yearsEnosis == null ? "" : String((r.yearsPrevious ?? 0) + (r.yearsEnosis ?? 0))} readOnly className="bg-slate-50" />
          </Field>
          <Field label="Availability">
            <Select value={r.availabilityStatus} onChange={(e) => set("availabilityStatus", e.target.value as ResourceInput["availabilityStatus"])}>
              {AVAILABILITY_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Available from">
            <Input type="date" value={r.availableFrom ?? ""} onChange={(e) => set("availableFrom", e.target.value || null)} />
          </Field>
        </div>
        <Field label="Major expertise" hint="Core specialization, key strengths, and types of systems worked on. Tech stack goes in its own section.">
          <Textarea rows={4} value={r.majorExpertise} onChange={(e) => set("majorExpertise", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Domains / industries">
            <TagInput value={r.domains} onChange={(v) => set("domains", v)} placeholder="FinTech, Healthcare…" />
          </Field>
          <Field label="Spoken languages">
            <TagInput value={r.languages} onChange={(v) => set("languages", v)} placeholder="English, Bangla…" />
          </Field>
        </div>
      </Section>

      <Section title="Tech stack" description="Type an item and press Enter, or paste a comma-separated list.">
        <SkillsEditor value={r.skills} onChange={(v) => set("skills", v)} />
      </Section>

      <Section title="Education">
        <EducationEditor value={r.education} onChange={(v) => set("education", v)} />
      </Section>

      <Section title="Achievements and certifications" description="Use full names, not abbreviations.">
        <AchievementsEditor value={r.achievements} onChange={(v) => set("achievements", v)} />
      </Section>

      <Section title="Projects" description="Client names are internal only and never appear in generated profiles.">
        <ProjectsEditor value={r.projects} onChange={(v) => set("projects", v)} />
      </Section>

      {state?.errors && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="mb-1 font-medium">Please fix the following:</p>
          <ul className="list-disc pl-5">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="sticky bottom-0 -mx-1 flex gap-2 border-t border-slate-200 bg-[#f6f7f9]/95 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save resource"}
        </Button>
        <a href={id ? `/admin/resources/${id}` : "/admin/resources"} className={buttonClass("secondary")}>
          Cancel
        </a>
      </div>
    </form>
  );
}
