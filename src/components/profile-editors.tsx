"use client";

import { useState } from "react";
import { TagInput } from "./tag-input";
import { Button, Field, Input, Select, Textarea } from "./ui";
import {
  ACHIEVEMENT_KINDS,
  EDUCATION_LEVELS,
  SKILL_CATEGORIES,
  type Achievement,
  type Education,
  type Project,
  type Skill,
  type SkillCategory,
} from "@/lib/resources/types";

/**
 * Section editors shared by the admin resource form and the resource's own update form.
 * Each is controlled: it receives the list and reports the whole new list on every change.
 */

export function numberOrNull(v: string) {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const emptyProject: Project = {
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

export function SkillsEditor({ value, onChange }: { value: Skill[]; onChange: (next: Skill[]) => void }) {
  function setCategory(category: SkillCategory, names: string[]) {
    const existing = new Map(value.filter((s) => s.category === category).map((s) => [s.name.toLowerCase(), s]));
    const updated: Skill[] = names.map((name) => existing.get(name.toLowerCase()) ?? { category, name, proficiency: null, years: null });
    onChange([...value.filter((s) => s.category !== category), ...updated]);
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SKILL_CATEGORIES.map((c) => (
        <Field key={c.key} label={c.label}>
          <TagInput value={value.filter((s) => s.category === c.key).map((s) => s.name)} onChange={(v) => setCategory(c.key, v)} />
        </Field>
      ))}
    </div>
  );
}

function patchAt<T>(list: T[], index: number, patch: Partial<T>) {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function EducationEditor({ value, onChange }: { value: Education[]; onChange: (next: Education[]) => void }) {
  return (
    <div className="space-y-3">
      {value.map((ed, i) => (
        <div key={i} className="grid items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[9rem_1fr_1fr_8rem_auto]">
          <Field label="Level">
            <Select value={ed.level} onChange={(e) => onChange(patchAt(value, i, { level: e.target.value as Education["level"] }))}>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Degree">
            <Input value={ed.degree} onChange={(e) => onChange(patchAt(value, i, { degree: e.target.value }))} placeholder="B.Sc. in Computer Science and Engineering" />
          </Field>
          <Field label="Institution">
            <Input value={ed.institution} onChange={(e) => onChange(patchAt(value, i, { institution: e.target.value }))} />
          </Field>
          <Field label="Year">
            <Input value={ed.year} onChange={(e) => onChange(patchAt(value, i, { year: e.target.value }))} placeholder="2021" />
          </Field>
          <Button type="button" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...value, { level: "bachelor", degree: "", institution: "", year: "" }])}>
        + Add education
      </Button>
    </div>
  );
}

export function AchievementsEditor({ value, onChange }: { value: Achievement[]; onChange: (next: Achievement[]) => void }) {
  return (
    <div className="space-y-3">
      {value.map((a, i) => (
        <div key={i} className="grid items-end gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-[10rem_1fr_10rem_6rem_auto]">
          <Field label="Type">
            <Select value={a.kind} onChange={(e) => onChange(patchAt(value, i, { kind: e.target.value as Achievement["kind"] }))}>
              {ACHIEVEMENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <Input value={a.name} onChange={(e) => onChange(patchAt(value, i, { name: e.target.value }))} placeholder="AWS Certified Developer – Associate" />
          </Field>
          <Field label="Issuer">
            <Input value={a.issuer} onChange={(e) => onChange(patchAt(value, i, { issuer: e.target.value }))} />
          </Field>
          <Field label="Year">
            <Input value={a.year} onChange={(e) => onChange(patchAt(value, i, { year: e.target.value }))} />
          </Field>
          <Button type="button" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
          <Field label="Credential link (optional)" className="sm:col-span-5">
            <Input value={a.credentialUrl} onChange={(e) => onChange(patchAt(value, i, { credentialUrl: e.target.value }))} placeholder="https://" />
          </Field>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...value, { kind: "certification", name: "", issuer: "", year: "", credentialUrl: "" }])}>
        + Add achievement or certification
      </Button>
    </div>
  );
}

/** Turns the textarea's lines into a list, dropping leading bullet characters. */
function linesToList(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

export function ProjectsEditor({ value, onChange }: { value: Project[]; onChange: (next: Project[]) => void }) {
  // Contributions are typed as free text (one per line); keeping the raw text avoids
  // losing a just-typed empty line while the list is derived from it.
  const [contribText, setContribText] = useState(() => value.map((p) => p.contributions.join("\n")));

  const patch = (i: number, p: Partial<Project>) => onChange(patchAt(value, i, p));
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const swap = <T,>(arr: T[]) => {
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    };
    onChange(swap(value));
    setContribText(swap);
  }

  return (
    <div className="space-y-4">
      {value.map((p, i) => (
        <div key={i} className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{p.name || `Project ${i + 1}`}</p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                ↑
              </Button>
              <Button type="button" variant="ghost" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move down">
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(value.filter((_, j) => j !== i));
                  setContribText((prev) => prev.filter((_, j) => j !== i));
                }}
              >
                Remove
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Project name" className="sm:col-span-2">
              <Input value={p.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Dental Practice Management Platform" />
            </Field>
            <Field label="Type">
              <Input value={p.type} onChange={(e) => patch(i, { type: e.target.value })} placeholder="Web application" />
            </Field>
            <Field label="Client name" hint="Internal only. Never shown to prospects.">
              <Input value={p.clientName} onChange={(e) => patch(i, { clientName: e.target.value })} />
            </Field>
            <Field label="Industry / domain">
              <Input value={p.industry} onChange={(e) => patch(i, { industry: e.target.value })} placeholder="Healthcare" />
            </Field>
            <Field label="Done at Enosis?">
              <Select value={p.atEnosis ? "yes" : "no"} onChange={(e) => patch(i, { atEnosis: e.target.value === "yes" })}>
                <option value="yes">Yes</option>
                <option value="no">No, previous workplace</option>
              </Select>
            </Field>
            <Field label="Your role">
              <Input value={p.role} onChange={(e) => patch(i, { role: e.target.value })} placeholder="Backend developer" />
            </Field>
            <Field label="Duration">
              <Input value={p.duration} onChange={(e) => patch(i, { duration: e.target.value })} placeholder="Jan 2024 – present" />
            </Field>
            <Field label="Team size">
              <Input value={p.teamSize} onChange={(e) => patch(i, { teamSize: e.target.value })} />
            </Field>
          </div>
          <Field label="Brief" hint="What the product is and who uses it, in 2–3 sentences.">
            <Textarea rows={3} value={p.brief} onChange={(e) => patch(i, { brief: e.target.value })} />
          </Field>
          <Field label="Key features">
            <Textarea rows={3} value={p.features} onChange={(e) => patch(i, { features: e.target.value })} />
          </Field>
          <Field label="Core technologies">
            <TagInput value={p.technologies} onChange={(v) => patch(i, { technologies: v })} placeholder="React, Node.js, PostgreSQL…" />
          </Field>
          <Field label="Your responsibilities and contributions" hint="One per line. Be concrete: what you built, with which technologies, and the result.">
            <Textarea
              rows={5}
              value={contribText[i] ?? ""}
              placeholder={"Designed the booking REST API in ASP.NET Core\nCut report load time from 40s to 6s with query tuning"}
              onChange={(e) => {
                const text = e.target.value;
                setContribText((prev) => prev.map((t, j) => (j === i ? text : t)));
                patch(i, { contributions: linesToList(text) });
              }}
            />
          </Field>
          <Field label="Measurable outcomes (optional)" hint='e.g. "Reduced file load time by 80–90%"'>
            <Textarea rows={2} value={p.outcomes} onChange={(e) => patch(i, { outcomes: e.target.value })} />
          </Field>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          onChange([...value, { ...emptyProject }]);
          setContribText((prev) => [...prev, ""]);
        }}
      >
        + Add project
      </Button>
    </div>
  );
}
