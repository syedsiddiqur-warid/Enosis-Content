import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { accessRequests, type AccessRequestRow, type UpdateDraft } from "@/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { fill, getTemplate, toHtml } from "@/lib/notify/templates";
import { SECTION_TITLES } from "@/lib/resources/diff";
import { SECTION_FIELDS, changedSections, confirmSections, getResource, toInput, updateResource } from "@/lib/resources/service";
import {
  PROFICIENCY_LEVELS,
  SKILL_CATEGORIES,
  resourceInputSchema,
  type ResourceInput,
  type Section,
} from "@/lib/resources/types";
import { getSettings } from "@/lib/settings";
import { baseUrl } from "@/lib/url";
import { firstName, markCompleted, type VisitMeta } from "./service";

/** Form steps and the record sections each one covers. The last step (review) covers none. */
export const UPDATE_STEPS = [
  { key: "personal", title: "Personal details", sections: ["personal", "education"] },
  { key: "experience", title: "Experience", sections: ["experience"] },
  { key: "skills", title: "Tech stack", sections: ["skills"] },
  { key: "achievements", title: "Certifications", sections: ["achievements"] },
  { key: "projects", title: "Projects", sections: ["projects"] },
  { key: "review", title: "Review and confirm", sections: [] },
] as const satisfies readonly { key: string; title: string; sections: Section[] }[];

/** Fields a resource may change. Email, email status, and seniority stay with the admin. */
const EDITABLE: (keyof ResourceInput)[] = [
  "name",
  "title",
  "yearsPrevious",
  "yearsEnosis",
  "availabilityStatus",
  "availableFrom",
  "majorExpertise",
  "domains",
  "languages",
  "skills",
  "education",
  "achievements",
  "projects",
];

// ---- Drafts ------------------------------------------------------------------
// Drafts are half-finished, so they are coerced into shape rather than rejected.

const s = (max: number) => z.string().max(max).catch("");
const n = z.number().min(0).max(60).nullable().catch(null);
const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max).catch([]);
const categoryKeys = SKILL_CATEGORIES.map((c) => c.key) as [string, ...string[]];

const draftDataSchema = z.object({
  name: s(200),
  email: s(320),
  emailVerified: z.boolean().catch(false),
  title: s(200),
  seniority: s(50),
  yearsPrevious: n,
  yearsEnosis: n,
  availabilityStatus: z.enum(["available", "partially_available", "allocated", "unknown"]).catch("unknown"),
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  majorExpertise: s(5000),
  domains: list(z.string().max(100), 50),
  languages: list(z.string().max(100), 30),
  skills: list(
    z.object({ category: z.enum(categoryKeys), name: z.string().max(100), proficiency: z.enum(PROFICIENCY_LEVELS).nullable().catch(null), years: n }),
    300,
  ),
  education: list(z.object({ level: z.enum(["bachelor", "master", "phd", "other"]).catch("other"), degree: s(5000), institution: s(5000), year: s(50) }), 20),
  achievements: list(
    z.object({ kind: z.enum(["certification", "award", "publication", "other"]).catch("other"), name: s(1000), issuer: s(200), year: s(20), credentialUrl: s(500) }),
    100,
  ),
  projects: list(
    z.object({
      name: s(300),
      type: s(100),
      brief: s(5000),
      features: s(5000),
      clientName: s(200),
      atEnosis: z.boolean().catch(true),
      industry: s(200),
      duration: s(100),
      teamSize: s(50),
      role: s(200),
      technologies: list(z.string().max(100), 100),
      contributions: list(z.string().max(2000), 100),
      outcomes: s(5000),
    }),
    50,
  ),
});

const stepKeys = UPDATE_STEPS.map((st) => st.key) as string[];

export function parseDraft(raw: unknown): UpdateDraft | null {
  const parsed = z
    .object({
      data: draftDataSchema,
      reviewed: z.array(z.string()).catch([]),
      step: z.number().int().min(0).max(UPDATE_STEPS.length - 1).catch(0),
    })
    .safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, reviewed: parsed.data.reviewed.filter((k) => stepKeys.includes(k)), data: parsed.data.data as ResourceInput };
}

/** What the form starts from: the saved draft, or the record as it is now (remembered as the base for merging). */
export async function getFormState(db: Db, req: AccessRequestRow) {
  const resource = req.resourceId ? await getResource(db, req.resourceId) : null;
  if (!resource) return null;
  let base = req.baseSnapshot;
  if (!base) {
    base = toInput(resource);
    await db.update(accessRequests).set({ baseSnapshot: base }).where(eq(accessRequests.id, req.id));
  }
  const draft = req.draft ? parseDraft(req.draft) : null;
  return { base, draft: draft ?? { data: base, reviewed: [], step: 0 }, savedAt: req.draftSavedAt };
}

export async function saveDraft(db: Db, req: AccessRequestRow, raw: unknown) {
  const draft = parseDraft(raw);
  if (!draft) return false;
  const savedAt = new Date();
  await db.update(accessRequests).set({ draft, draftSavedAt: savedAt }).where(eq(accessRequests.id, req.id));
  return savedAt;
}

// ---- Submission ----------------------------------------------------------------

function blank(...values: string[]) {
  return values.every((v) => !v.trim());
}

/** Copies the fields a resource may edit onto a record, dropping list rows they left completely empty. */
function applyEditable(target: ResourceInput, data: ResourceInput): ResourceInput {
  const out: ResourceInput = { ...target };
  for (const key of EDITABLE) (out as Record<string, unknown>)[key] = data[key];
  out.skills = data.skills.filter((sk) => sk.name.trim());
  out.education = data.education.filter((e) => !blank(e.degree, e.institution, e.year));
  out.achievements = data.achievements.filter((a) => !blank(a.name, a.issuer, a.year, a.credentialUrl));
  out.projects = data.projects.filter(
    (p) => !blank(p.name, p.type, p.brief, p.features, p.clientName, p.industry, p.role, p.duration, p.teamSize, p.outcomes) || p.technologies.length || p.contributions.length,
  );
  return out;
}

const FIELD_STEP: Partial<Record<keyof ResourceInput, string>> = {
  name: "Personal details",
  title: "Personal details",
  education: "Personal details",
  yearsPrevious: "Experience",
  yearsEnosis: "Experience",
  majorExpertise: "Experience",
  availableFrom: "Experience",
  skills: "Tech stack",
  achievements: "Certifications",
  projects: "Projects",
};

function friendlyIssue(issue: z.core.$ZodIssue, data: ResourceInput) {
  const [field, index, sub] = issue.path as [keyof ResourceInput, number?, string?];
  const step = FIELD_STEP[field] ?? "Your details";
  if (field === "name") return `${step}: please enter your name.`;
  if (field === "projects" && typeof index === "number") {
    const label = data.projects[index]?.name || `Project ${index + 1}`;
    return sub === "name" ? `Projects: please add a name for ${label}.` : `Projects: please check "${sub}" in ${label}.`;
  }
  if (field === "achievements" && sub === "name") return "Certifications: each item needs a name (or remove the empty one).";
  return `${step}: please check ${String(sub ?? field)}.`;
}

export type SubmitResult = { ok: true; thankYou: string } | { ok: false; errors: string[] };

/**
 * Applies a resource's submission. Only sections they actually changed (compared with what they were shown)
 * are written, so edits an admin made in the meantime to other sections are kept.
 */
export async function submitUpdate(db: Db, req: AccessRequestRow, raw: unknown, meta: VisitMeta): Promise<SubmitResult> {
  const draft = parseDraft(raw);
  const resource = req.resourceId ? await getResource(db, req.resourceId) : null;
  if (!draft || !resource) return { ok: false, errors: ["Something went wrong reading your form. Please reload the page and try again."] };

  const current = toInput(resource);
  const base = req.baseSnapshot ?? current;
  const changed = changedSections(base, applyEditable(base, draft.data));

  const submitted = applyEditable(current, draft.data);
  const merged: ResourceInput = { ...current };
  for (const section of changed) {
    for (const field of SECTION_FIELDS[section]) (merged as Record<string, unknown>)[field] = submitted[field];
  }

  const parsed = resourceInputSchema.safeParse(merged);
  if (!parsed.success) return { ok: false, errors: [...new Set(parsed.error.issues.map((i) => friendlyIssue(i, merged)))] };

  const reviewedSections = UPDATE_STEPS.filter((st) => draft.reviewed.includes(st.key)).flatMap((st) => st.sections as readonly Section[]);
  const confirmed = reviewedSections.filter((sec) => !changed.includes(sec));
  const actor = { email: req.recipientEmail, source: "resource" as const };

  if (changed.length) await updateResource(db, resource.id, parsed.data, actor, `Submitted by ${req.recipientName} via update link`);
  if (confirmed.length) await confirmSections(db, resource.id, confirmed, "resource");

  await db
    .update(accessRequests)
    .set({
      submission: { before: current, after: parsed.data, changedSections: changed, confirmedSections: confirmed, submittedAt: new Date().toISOString() },
      draft: null,
    })
    .where(eq(accessRequests.id, req.id));
  await markCompleted(db, req.id, meta);

  const settings = await getSettings(db);
  await notifyAdmin(req, changed, confirmed, settings.senderName);

  const template = await getTemplate(db, "thank_you");
  const vars = { name: firstName(parsed.data.name), sender_name: settings.senderName };
  const thankYou = fill(template.body, vars).text;
  if (settings.sendThankYouEmail) {
    await sendEmail({
      to: req.recipientEmail,
      subject: fill(template.subject, vars).text,
      text: thankYou,
      html: toHtml(thankYou),
      recipientVerified: resource.emailVerified,
      templateKey: "thank_you",
      requestId: req.id,
    });
  }
  return { ok: true, thankYou };
}

async function notifyAdmin(req: AccessRequestRow, changed: Section[], confirmed: Section[], senderName: string) {
  const link = `${await baseUrl()}/admin/requests/${req.id}`;
  const names = (list: Section[]) => (list.length ? list.map((sec) => SECTION_TITLES[sec]).join(", ") : "none");
  const text = [
    `Hi,`,
    ``,
    `${req.recipientName} has reviewed their profile information${req.context.roleTitle ? ` for the ${req.context.roleTitle} request` : ""}.`,
    ``,
    `Updated: ${names(changed)}`,
    `Confirmed as still correct: ${names(confirmed)}`,
    ``,
    `See the highlighted changes: ${link}`,
    ``,
    senderName,
  ].join("\n");
  await sendEmail({
    to: req.createdBy,
    subject: `${req.recipientName} ${changed.length ? "updated" : "confirmed"} their profile information`,
    text,
    html: toHtml(text),
    recipientVerified: true,
    templateKey: "admin_submission",
    requestId: req.id,
  });
}
