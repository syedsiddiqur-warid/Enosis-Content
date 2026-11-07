"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import type { AiSettings } from "@/lib/settings";
import { saveAiSettingsAction } from "./actions";

function Num({ name, label, value, min, max }: { name: keyof AiSettings; label: string; value: number; min: number; max: number }) {
  return (
    <Field label={label}>
      <Input type="number" name={name} defaultValue={value} min={min} max={max} required />
    </Field>
  );
}

export function AiSettingsForm({ settings, mode, model }: { settings: AiSettings; mode: string; model: string }) {
  const [state, action, pending] = useActionState(saveAiSettingsAction, null);
  return (
    <form action={action} id="ai">
      <Card className="space-y-5 p-5">
        <p className={`rounded-md p-3 text-sm ${mode === "claude" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {mode === "claude"
            ? `Profiles are written by Claude (${model}).`
            : "AI is not configured, so profiles are built as plain offline drafts from the record. Add ANTHROPIC_API_KEY to .env and restart to use Claude."}
        </p>
        <Field label="House style guide" hint="Sent to Claude with every profile. The hard rules (only facts from the record, no client names, gaps kept internal) always apply on top of this.">
          <Textarea name="styleGuide" rows={11} defaultValue={settings.styleGuide} className="font-mono text-[13px]" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num name="summaryMaxWords" label="Career summary: max words" value={settings.summaryMaxWords} min={20} max={300} />
          <Num name="competenciesMin" label="Core competencies: min bullets" value={settings.competenciesMin} min={1} max={10} />
          <Num name="competenciesMax" label="Core competencies: max bullets" value={settings.competenciesMax} min={1} max={10} />
          <Num name="competencyMaxWords" label="Each competency: max words" value={settings.competencyMaxWords} min={10} max={100} />
          <Num name="projectsMin" label="Projects: min" value={settings.projectsMin} min={1} max={10} />
          <Num name="projectsMax" label="Projects: max" value={settings.projectsMax} min={1} max={10} />
          <Num name="projectDescriptionMaxWords" label="Project description: max words" value={settings.projectDescriptionMaxWords} min={20} max={300} />
          <Num name="contributionsMax" label="Contributions per project: max" value={settings.contributionsMax} min={1} max={15} />
          <Num name="contributionMaxWords" label="Each contribution: max words" value={settings.contributionMaxWords} min={5} max={80} />
        </div>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save AI writing settings"}
          </Button>
          <Button type="submit" name="resetStyle" value="1" variant="secondary" disabled={pending}>
            Reset style guide to default
          </Button>
        </div>
      </Card>
    </form>
  );
}
