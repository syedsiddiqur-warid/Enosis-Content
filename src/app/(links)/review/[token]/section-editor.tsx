"use client";

import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { ProfileContent } from "@/lib/profiles/types";
import { getSection } from "@/lib/profiles/sections";

const lines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*▪]\s*/, "").trim())
    .filter(Boolean);
const commas = (t: string) =>
  t
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Plain-text editor for one section; converts to and from the section's structured value. */
export function SectionEditor({ content, section, onSave, onCancel, saving }: { content: ProfileContent; section: string; onSave: (value: unknown) => void; onCancel: () => void; saving: boolean }) {
  const value = getSection(content, section);
  const isProject = section.startsWith("project:");

  const [text, setText] = useState(() => {
    switch (section) {
      case "summary":
        return value as string;
      case "competencies":
      case "awards":
        return (value as string[]).join("\n");
      case "expertise":
        return content.technicalExpertise.map((r) => `${r.category}: ${r.items.join(", ")}`).join("\n");
      case "education":
        return content.education.map((e) => [e.degree, e.institution, e.year].join(" | ")).join("\n");
      default:
        return "";
    }
  });
  const [fields, setFields] = useState(() => {
    if (section === "header") return { name: content.name, title: content.title };
    if (isProject) {
      const p = content.projects[Number(section.slice(8))];
      return { title: p.title, industry: p.industry, description: p.description, technologies: p.coreTechnologies.join(", "), contributions: p.contributions.join("\n") };
    }
    return {} as Record<string, string>;
  });
  const f = (k: string) => (fields as Record<string, string>)[k] ?? "";
  const setF = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  function build(): unknown {
    switch (section) {
      case "header":
        return { name: f("name"), title: f("title") };
      case "summary":
        return text.trim();
      case "competencies":
      case "awards":
        return lines(text);
      case "expertise":
        return lines(text).map((l) => {
          const [category, ...rest] = l.split(":");
          return { category: category.trim(), items: commas(rest.join(":")) };
        });
      case "education":
        return lines(text).map((l) => {
          const [degree = "", institution = "", year = ""] = l.split("|").map((x) => x.trim());
          return { degree, institution, year };
        });
      default:
        return { title: f("title"), industry: f("industry"), description: f("description").trim(), coreTechnologies: commas(f("technologies")), contributions: lines(f("contributions")) };
    }
  }

  const hint: Record<string, string> = {
    competencies: "One bullet per line.",
    awards: "One item per line.",
    expertise: "One category per line, like “Frameworks: React, Node.js”.",
    education: "One per line: Degree | Institution | Year",
  };

  return (
    <div className="rounded-md border-2 border-brand/40 bg-brand-soft/40 p-4 text-sm">
      {section === "header" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={f("name")} onChange={(e) => setF("name", e.target.value)} />
          </Field>
          <Field label="Title">
            <Input value={f("title")} onChange={(e) => setF("title", e.target.value)} />
          </Field>
        </div>
      ) : isProject ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <Input value={f("title")} onChange={(e) => setF("title", e.target.value)} />
            </Field>
            <Field label="Industry">
              <Input value={f("industry")} onChange={(e) => setF("industry", e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={4} value={f("description")} onChange={(e) => setF("description", e.target.value)} />
          </Field>
          <Field label="Core technologies" hint="Comma-separated.">
            <Input value={f("technologies")} onChange={(e) => setF("technologies", e.target.value)} />
          </Field>
          <Field label="Major contributions" hint="One per line.">
            <Textarea rows={6} value={f("contributions")} onChange={(e) => setF("contributions", e.target.value)} />
          </Field>
        </div>
      ) : (
        <Field label="Edit text" hint={hint[section]}>
          <Textarea rows={section === "summary" ? 5 : 7} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={() => onSave(build())} disabled={saving}>
          {saving ? "Saving…" : "Save edit"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
