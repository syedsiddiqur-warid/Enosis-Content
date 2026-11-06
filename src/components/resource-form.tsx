"use client";

import { useActionState, useState, type ReactNode } from "react";
import { saveResourceAction } from "@/app/admin/resources/actions";
import { TagInput } from "./tag-input";
import { Button, Card, Field, Input, Select, Textarea, buttonClass } from "./ui";
import {
  ACHIEVEMENT_KINDS,
  AVAILABILITY_STATUSES,
  EDUCATION_LEVELS,
  SENIORITY_LEVELS,
  SKILL_CATEGORIES,
  type Achievement,
  type Education,
  type Project,
  type ResourceInput,
  type Skill,
  type SkillCategory,
} from "@/lib/resources/types";

const emptyProject: Project = {
  name: "",
  type: "",
  brief: "",
  features: "",
  clientName: "",
  atEnosis: true,
  industry: "",
  duration: "",
  teamSize: "",
  role: "",
  technologies: [],
  contributions: [],
  outcomes: "",
};

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

function numberOrNull(v: string) {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Turns the textarea's lines into a list, dropping leading bullet characters. */
function linesToList(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function ResourceForm({ id, initial }: { id?: string; initial: ResourceInput }) {
  const [state, formAction, pending] = useActionState(saveResourceAction, null);
  const [r, setR] = useState<ResourceInput>(initial);
  // Contributions are edited as free text and only split into a list on save.
  const [contribText, setContribText] = useState(() => initial.projects.map((p) => p.contributions.join("\n")));

  const set = <K extends keyof ResourceInput>(key: K, value: ResourceInput[K]) => setR((prev) => ({ ...prev, [key]: value }));

  function skillsIn(category: SkillCategory) {
    return r.skills.filter((s) => s.category === category).map((s) => s.name);
  }
  function setSkillsIn(category: SkillCategory, names: string[]) {
    const existing = new Map(r.skills.filter((s) => s.category === category).map((s) => [s.name.toLowerCase(), s]));
    const updated: Skill[] = names.map((name) => existing.get(name.toLowerCase()) ?? { category, name, proficiency: null, years: null });
    set("skills", [...r.skills.filter((s) => s.category !== category), ...updated]);
  }

  function updateList<T>(key: "education" | "achievements" | "projects", index: number, patch: Partial<T>) {
    setR((prev) => ({
      ...prev,
      [key]: (prev[key] as T[]).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }
  function removeFromList(key: "education" | "achievements" | "projects", index: number) {
    setR((prev) => ({ ...prev, [key]: (prev[key] as unknown[]).filter((_, i) => i !== index) }));
    if (key === "projects") setContribText((prev) => prev.filter((_, i) => i !== index));
  }
  function moveProject(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= r.projects.length) return;
    const swap = <T,>(arr: T[]) => {
      const next = [...arr];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    };
    set("projects", swap(r.projects));
    setContribText(swap);
  }

  const payload: ResourceInput = {
    ...r,
    projects: r.projects.map((p, i) => ({ ...p, contributions: linesToList(contribText[i] ?? "") })),
  };

  return (
    <form action={formAction} className="space-y-5">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

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
        <div className="grid gap-4 sm:grid-cols-2">
          {SKILL_CATEGORIES.map((c) => (
            <Field key={c.key} label={c.label}>
              <TagInput value={skillsIn(c.key)} onChange={(v) => setSkillsIn(c.key, v)} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Education">
        {r.education.map((ed, i) => (
          <div key={i} className="grid items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[9rem_1fr_1fr_8rem_auto]">
            <Field label="Level">
              <Select value={ed.level} onChange={(e) => updateList<Education>("education", i, { level: e.target.value as Education["level"] })}>
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Degree">
              <Input value={ed.degree} onChange={(e) => updateList<Education>("education", i, { degree: e.target.value })} />
            </Field>
            <Field label="Institution">
              <Input value={ed.institution} onChange={(e) => updateList<Education>("education", i, { institution: e.target.value })} />
            </Field>
            <Field label="Year">
              <Input value={ed.year} onChange={(e) => updateList<Education>("education", i, { year: e.target.value })} />
            </Field>
            <Button type="button" variant="ghost" onClick={() => removeFromList("education", i)}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => set("education", [...r.education, { level: "bachelor", degree: "", institution: "", year: "" }])}>
          + Add education
        </Button>
      </Section>

      <Section title="Achievements and certifications" description="Use full names, not abbreviations.">
        {r.achievements.map((a, i) => (
          <div key={i} className="grid items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[10rem_1fr_10rem_6rem_auto]">
            <Field label="Type">
              <Select value={a.kind} onChange={(e) => updateList<Achievement>("achievements", i, { kind: e.target.value as Achievement["kind"] })}>
                {ACHIEVEMENT_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name">
              <Input value={a.name} onChange={(e) => updateList<Achievement>("achievements", i, { name: e.target.value })} />
            </Field>
            <Field label="Issuer">
              <Input value={a.issuer} onChange={(e) => updateList<Achievement>("achievements", i, { issuer: e.target.value })} />
            </Field>
            <Field label="Year">
              <Input value={a.year} onChange={(e) => updateList<Achievement>("achievements", i, { year: e.target.value })} />
            </Field>
            <Button type="button" variant="ghost" onClick={() => removeFromList("achievements", i)}>
              Remove
            </Button>
            <Field label="Credential link (optional)" className="sm:col-span-5">
              <Input value={a.credentialUrl} onChange={(e) => updateList<Achievement>("achievements", i, { credentialUrl: e.target.value })} placeholder="https://" />
            </Field>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => set("achievements", [...r.achievements, { kind: "certification", name: "", issuer: "", year: "", credentialUrl: "" }])}
        >
          + Add achievement or certification
        </Button>
      </Section>

      <Section title="Projects" description="Client names are internal only and never appear in generated profiles.">
        {r.projects.map((p, i) => (
          <div key={i} className="space-y-3 rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Project {i + 1}</p>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" onClick={() => moveProject(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </Button>
                <Button type="button" variant="ghost" onClick={() => moveProject(i, 1)} disabled={i === r.projects.length - 1} aria-label="Move down">
                  ↓
                </Button>
                <Button type="button" variant="ghost" onClick={() => removeFromList("projects", i)}>
                  Remove
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Project name" className="sm:col-span-2">
                <Input value={p.name} onChange={(e) => updateList<Project>("projects", i, { name: e.target.value })} />
              </Field>
              <Field label="Type">
                <Input value={p.type} onChange={(e) => updateList<Project>("projects", i, { type: e.target.value })} placeholder="Web application" />
              </Field>
              <Field label="Client name (internal)">
                <Input value={p.clientName} onChange={(e) => updateList<Project>("projects", i, { clientName: e.target.value })} />
              </Field>
              <Field label="Industry / domain">
                <Input value={p.industry} onChange={(e) => updateList<Project>("projects", i, { industry: e.target.value })} />
              </Field>
              <Field label="Done at Enosis?">
                <Select value={p.atEnosis ? "yes" : "no"} onChange={(e) => updateList<Project>("projects", i, { atEnosis: e.target.value === "yes" })}>
                  <option value="yes">Yes</option>
                  <option value="no">No, previous workplace</option>
                </Select>
              </Field>
              <Field label="Role">
                <Input value={p.role} onChange={(e) => updateList<Project>("projects", i, { role: e.target.value })} />
              </Field>
              <Field label="Duration">
                <Input value={p.duration} onChange={(e) => updateList<Project>("projects", i, { duration: e.target.value })} placeholder="e.g. Jan 2024 – present" />
              </Field>
              <Field label="Team size">
                <Input value={p.teamSize} onChange={(e) => updateList<Project>("projects", i, { teamSize: e.target.value })} />
              </Field>
            </div>
            <Field label="Brief">
              <Textarea rows={3} value={p.brief} onChange={(e) => updateList<Project>("projects", i, { brief: e.target.value })} />
            </Field>
            <Field label="Key features">
              <Textarea rows={3} value={p.features} onChange={(e) => updateList<Project>("projects", i, { features: e.target.value })} />
            </Field>
            <Field label="Core technologies">
              <TagInput value={p.technologies} onChange={(v) => updateList<Project>("projects", i, { technologies: v })} />
            </Field>
            <Field label="Responsibilities and contributions" hint="One per line. Be concrete: what you built, with which technologies, and the result.">
              <Textarea
                rows={5}
                value={contribText[i] ?? ""}
                onChange={(e) => setContribText((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
              />
            </Field>
            <Field label="Measurable outcomes (optional)" hint='e.g. "Reduced file load time by 80–90%"'>
              <Textarea rows={2} value={p.outcomes} onChange={(e) => updateList<Project>("projects", i, { outcomes: e.target.value })} />
            </Field>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            set("projects", [...r.projects, { ...emptyProject }]);
            setContribText((prev) => [...prev, ""]);
          }}
        >
          + Add project
        </Button>
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
