"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AchievementsEditor, EducationEditor, ProjectsEditor, SkillsEditor, numberOrNull } from "@/components/profile-editors";
import { TagInput } from "@/components/tag-input";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { diffResources } from "@/lib/resources/diff";
import { AVAILABILITY_STATUSES, type ResourceInput } from "@/lib/resources/types";
import { saveDraftAction, submitUpdateAction } from "../../actions";

type Step = { key: string; title: string };
type Draft = { data: ResourceInput; reviewed: string[]; step: number };

/** Which record fields each step edits, to show "Edited" vs "Still correct". */
const STEP_FIELDS: Record<string, (keyof ResourceInput)[]> = {
  personal: ["name", "title", "education"],
  experience: ["yearsPrevious", "yearsEnosis", "availabilityStatus", "availableFrom", "majorExpertise", "domains", "languages"],
  skills: ["skills"],
  achievements: ["achievements"],
  projects: ["projects"],
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}

const AUTOSAVE_MS = 2000;

function Help({ children }: { children: ReactNode }) {
  return <div className="rounded-md bg-brand-soft p-3 text-sm leading-relaxed text-slate-700">{children}</div>;
}

export function UpdateForm(props: {
  token: string;
  steps: Step[];
  base: ResourceInput;
  initial: Draft;
  savedAt: string | null;
  firstName: string;
  roleTitle?: string;
  dueDate?: string;
}) {
  const { token, steps, base } = props;
  const [data, setData] = useState(props.initial.data);
  const [reviewed, setReviewed] = useState<string[]>(props.initial.reviewed);
  const [step, setStep] = useState(props.initial.step);
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; at?: string; error?: string }>(
    props.savedAt ? { state: "saved", at: props.savedAt } : { state: "idle" },
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [thankYou, setThankYou] = useState<string | null>(null);

  const set = <K extends keyof ResourceInput>(key: K, value: ResourceInput[K]) => setData((prev) => ({ ...prev, [key]: value }));
  const current = steps[step];
  const isReview = current.key === "review";

  const edited = (key: string) => (STEP_FIELDS[key] ?? []).some((f) => stableJson(data[f]) !== stableJson(base[f]));

  // ---- Autosave: debounced after edits, immediately on step change ----
  const latest = useRef<Draft>({ data, reviewed, step });
  latest.current = { data, reviewed, step };
  const dirty = useRef(false);
  const first = useRef(true);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ state: "saving" });
    try {
      const res = await saveDraftAction(token, JSON.stringify(latest.current));
      setSave(res.savedAt ? { state: "saved", at: res.savedAt } : { state: "error", error: res.error });
    } catch {
      dirty.current = true;
      setSave({ state: "error", error: "Couldn't save just now. We'll try again." });
    }
  }, [token]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [data, reviewed, step, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  function goTo(next: number, markReviewed = false) {
    if (markReviewed && !isReview && !reviewed.includes(current.key)) setReviewed((r) => [...r, current.key]);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    setSubmitting(true);
    setErrors([]);
    try {
      const res = await submitUpdateAction(token, JSON.stringify({ data, reviewed, step }));
      if (res.ok) {
        dirty.current = false;
        setThankYou(res.thankYou);
        window.scrollTo({ top: 0 });
      } else setErrors(res.errors);
    } catch {
      setErrors(["Something went wrong while sending. Your changes are saved; please try again in a moment."]);
    } finally {
      setSubmitting(false);
    }
  }

  if (thankYou) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</div>
        <p className="text-base leading-relaxed whitespace-pre-line text-slate-800">{thankYou}</p>
        <p className="mt-4 text-sm text-slate-500">You can close this page now.</p>
      </Card>
    );
  }

  const changes = isReview ? diffResources(base, data) : [];
  const saveText =
    save.state === "saving"
      ? "Saving…"
      : save.state === "saved" && save.at
        ? `Saved ${new Date(save.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : save.state === "error"
          ? save.error
          : "Changes save automatically";

  return (
    <div className="pb-24">
      <Card className="mb-4 p-5 sm:p-6">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Hi {props.firstName}, thanks for helping!</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {props.roleTitle && (
            <>
              We&apos;d love to put your profile forward for a <b>{props.roleTitle}</b> role.{" "}
            </>
          )}
          Everything is already filled in. Just check each step and change only what&apos;s different. If a step is still right, tap <b>This is still correct</b>.
          {props.dueDate && (
            <>
              {" "}
              It would be great if you could finish by <b>{props.dueDate}</b>.
            </>
          )}
        </p>
      </Card>

      {/* Progress */}
      <nav aria-label="Steps" className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <span>{reviewed.length} of {steps.length - 1} checked</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-brand transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <ol className="flex gap-1 overflow-x-auto pb-1">
          {steps.map((s, i) => {
            const done = reviewed.includes(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cx(
                    "cursor-pointer rounded-full px-3 py-1 text-xs whitespace-nowrap",
                    i === step ? "bg-brand text-white" : done ? "bg-emerald-50 text-emerald-800" : "bg-white text-slate-600 ring-1 ring-slate-200",
                  )}
                >
                  {done && i !== step ? "✓ " : ""}
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{current.title}</h2>
          {!isReview &&
            (edited(current.key) ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Edited</span>
            ) : (
              <Button type="button" variant="secondary" onClick={() => goTo(Math.min(step + 1, steps.length - 1), true)}>
                ✓ This is still correct
              </Button>
            ))}
        </div>

        <div className="space-y-4">
          {current.key === "personal" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input value={data.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Job title" hint='e.g. "Senior Software Engineer"'>
                  <Input value={data.title} onChange={(e) => set("title", e.target.value)} />
                </Field>
                <Field label="Email" hint="To change your email, just reply to our message.">
                  <Input value={data.email} readOnly className="bg-slate-50 text-slate-500" />
                </Field>
              </div>
              <h3 className="pt-2 text-sm font-semibold text-slate-800">Education</h3>
              <EducationEditor value={data.education} onChange={(v) => set("education", v)} />
            </>
          )}

          {current.key === "experience" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Years at previous workplaces">
                  <Input type="number" inputMode="decimal" step="0.5" min="0" value={data.yearsPrevious ?? ""} onChange={(e) => set("yearsPrevious", numberOrNull(e.target.value))} />
                </Field>
                <Field label="Years at Enosis">
                  <Input type="number" inputMode="decimal" step="0.5" min="0" value={data.yearsEnosis ?? ""} onChange={(e) => set("yearsEnosis", numberOrNull(e.target.value))} />
                </Field>
                <Field label="Total">
                  <Input readOnly className="bg-slate-50" value={data.yearsPrevious == null && data.yearsEnosis == null ? "" : String((data.yearsPrevious ?? 0) + (data.yearsEnosis ?? 0))} />
                </Field>
              </div>
              <Field label="Major expertise" hint="Your core specialization, key strengths, and the kinds of systems you've worked on. Your tech stack goes in the next step.">
                <Textarea
                  rows={5}
                  value={data.majorExpertise}
                  onChange={(e) => set("majorExpertise", e.target.value)}
                  placeholder="e.g. Backend engineer focused on high-traffic APIs for FinTech and SaaS products; strong in performance tuning and database design."
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your availability">
                  <Select value={data.availabilityStatus} onChange={(e) => set("availabilityStatus", e.target.value as ResourceInput["availabilityStatus"])}>
                    {AVAILABILITY_STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.key === "unknown" ? "Not sure" : s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Available from (optional)">
                  <Input type="date" value={data.availableFrom ?? ""} onChange={(e) => set("availableFrom", e.target.value || null)} />
                </Field>
                <Field label="Industries you've worked in">
                  <TagInput value={data.domains} onChange={(v) => set("domains", v)} placeholder="FinTech, Healthcare…" />
                </Field>
                <Field label="Languages you speak">
                  <TagInput value={data.languages} onChange={(v) => set("languages", v)} placeholder="English, Bangla…" />
                </Field>
              </div>
            </>
          )}

          {current.key === "skills" && (
            <>
              <Help>Add the tools you&apos;ve used in real work, and remove anything you wouldn&apos;t be comfortable being asked about. Type an item and press Enter, or paste a comma-separated list.</Help>
              <SkillsEditor value={data.skills} onChange={(v) => set("skills", v)} />
            </>
          )}

          {current.key === "achievements" && (
            <>
              <Help>Include certifications, awards, competition results, and publications. Please write the full name, not an abbreviation (e.g. &quot;AWS Certified Solutions Architect – Associate&quot;).</Help>
              <AchievementsEditor value={data.achievements} onChange={(v) => set("achievements", v)} />
            </>
          )}

          {current.key === "projects" && (
            <>
              <Help>
                <p className="mb-1 font-medium text-slate-800">What makes a good project description</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>Name the technologies you actually used (e.g. &quot;ASP.NET Core, React, SQL Server&quot;).</li>
                  <li>Say what <i>you</i> built, not just what the team did (&quot;Designed the booking API&quot;).</li>
                  <li>Add measurable results when you have them (&quot;Cut report time from 40s to 6s&quot;).</li>
                </ul>
                <p className="mt-1">Client names are for our records only and are never shown to prospects.</p>
              </Help>
              <ProjectsEditor value={data.projects} onChange={(v) => set("projects", v)} />
            </>
          )}

          {isReview && (
            <>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {steps.slice(0, -1).map((s, i) => {
                  const status = edited(s.key) ? "Updated" : reviewed.includes(s.key) ? "Still correct" : "Not checked yet";
                  return (
                    <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800">{s.title}</span>
                      <span className="flex items-center gap-3">
                        <span
                          className={cx(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            status === "Updated" ? "bg-amber-50 text-amber-800" : status === "Still correct" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {status}
                        </span>
                        <button type="button" className="cursor-pointer text-xs text-brand underline" onClick={() => goTo(i)}>
                          {status === "Not checked yet" ? "Check" : "Edit"}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Your changes</h3>
                {changes.length === 0 ? (
                  <p className="text-sm text-slate-600">No changes. Submitting will confirm that your information is still correct.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {changes.map((c) => (
                      <li key={c.section} className="rounded-md border border-slate-200 p-3">
                        <p className="mb-1 font-medium text-slate-800">{c.title}</p>
                        <ul className="space-y-0.5 text-slate-600">
                          {c.fields.map((f) => (
                            <li key={f.label}>
                              {f.label} updated
                            </li>
                          ))}
                          {c.items.map((it, j) => (
                            <li key={j}>
                              <span className={it.kind === "added" ? "text-emerald-700" : it.kind === "removed" ? "text-red-700" : "text-amber-800"}>
                                {it.kind === "added" ? "Added" : it.kind === "removed" ? "Removed" : "Updated"}
                              </span>{" "}
                              {it.label}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {errors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  <p className="mb-1 font-medium">Almost there. Please fix:</p>
                  <ul className="list-disc pl-5">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Sticky footer navigation */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button type="button" variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 0}>
            Back
          </Button>
          <span className={cx("flex-1 truncate text-center text-xs", save.state === "error" ? "text-red-700" : "text-slate-500")} aria-live="polite">
            {saveText}
          </span>
          {isReview ? (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? "Sending…" : "Submit"}
            </Button>
          ) : (
            <Button type="button" onClick={() => goTo(step + 1, true)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
