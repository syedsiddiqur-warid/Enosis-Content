import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { importBatches, resources, type ImportResult, type ResourceRow } from "@/db/schema";
import { createResource, nameKey, sampleEmail, takenEmails, toInput, updateResource } from "@/lib/resources/service";
import type { ResourceInput } from "@/lib/resources/types";
import { parseRow, type Mapping, type ParsedRow } from "./google-form";

export type PlannedRow = ParsedRow & {
  action: "create" | "update" | "skip";
  reason?: string;
  existing?: Pick<ResourceRow, "id" | "name" | "email">;
  duplicatesDropped: number;
};

/** Parses every row, keeps the latest submission per person, and decides create/update/skip. */
export async function planResourceImport(db: Db, rows: string[][], mapping: Mapping) {
  const parsed = rows.map((row, i) => parseRow(row, mapping, i + 2));
  const byPerson = new Map<string, { row: ParsedRow; dropped: number }>();
  const missingName: ParsedRow[] = [];

  for (const row of parsed) {
    if (!row.name) {
      missingName.push(row);
      continue;
    }
    const key = nameKey(row.name);
    const prev = byPerson.get(key);
    if (!prev) byPerson.set(key, { row, dropped: 0 });
    else if (row.timestamp >= prev.row.timestamp) byPerson.set(key, { row, dropped: prev.dropped + 1 });
    else prev.dropped++;
  }

  const existing = await db.select().from(resources);
  const existingByKey = new Map(existing.map((r) => [r.nameKey, r]));

  const planned: PlannedRow[] = [...byPerson.values()].map(({ row, dropped }) => {
    const match = existingByKey.get(nameKey(row.name));
    if (!match) return { ...row, action: "create", duplicatesDropped: dropped };
    const ref = { id: match.id, name: match.name, email: match.email };
    // Don't let an old form submission overwrite newer edits made in the app.
    if (match.lastUpdatedBy !== "import" && row.timestamp && match.updatedAt.getTime() > row.timestamp) {
      return { ...row, action: "skip", reason: "The app record was edited after this form submission.", existing: ref, duplicatesDropped: dropped };
    }
    return { ...row, action: "update", existing: ref, duplicatesDropped: dropped };
  });

  planned.sort((a, b) => a.name.localeCompare(b.name));
  return {
    planned,
    missingName,
    counts: {
      rows: rows.length,
      people: planned.length,
      create: planned.filter((p) => p.action === "create").length,
      update: planned.filter((p) => p.action === "update").length,
      skip: planned.filter((p) => p.action === "skip").length,
      duplicates: planned.reduce((n, p) => n + p.duplicatesDropped, 0),
      missingName: missingName.length,
    },
  };
}

function uniq(items: string[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Form data replaces the sections the form covers; app-only fields (seniority, availability, …) are kept. */
function mergeIntoInput(base: ResourceInput, row: ParsedRow): ResourceInput {
  return {
    ...base,
    name: row.name,
    title: row.title || base.title,
    yearsPrevious: row.yearsPrevious,
    yearsEnosis: row.yearsEnosis,
    majorExpertise: row.majorExpertise,
    domains: uniq([...base.domains, ...row.projects.map((p) => p.industry).filter(Boolean)]),
    skills: row.skills.map((s) => {
      const prev = base.skills.find((b) => b.category === s.category && b.name.toLowerCase() === s.name.toLowerCase());
      return prev ? { ...s, proficiency: prev.proficiency, years: prev.years } : s;
    }),
    education: row.education,
    achievements: row.achievements,
    projects: row.projects,
  };
}

export async function applyResourceImport(db: Db, batchId: string, adminEmail: string, sampleDomain: string) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch || !batch.mapping) throw new Error("Import not found or not mapped.");
  if (batch.status === "applied") throw new Error("This import was already applied.");

  const { planned, counts } = await planResourceImport(db, batch.rows, batch.mapping);
  const taken = await takenEmails(db);
  const actor = { email: adminEmail, source: "import" as const };
  const results: ImportResult[] = [];

  for (const row of planned) {
    const result: ImportResult = { rowNumber: row.rowNumber, name: row.name, outcome: row.action, detail: row.reason, resourceId: row.existing?.id };
    results.push(result);
    if (row.action === "create") {
      const hasRealEmail = !!row.email && !taken.has(row.email);
      if (hasRealEmail) taken.add(row.email);
      const blank: ResourceInput = {
        name: row.name,
        email: hasRealEmail ? row.email : sampleEmail(row.name, sampleDomain, taken),
        emailVerified: hasRealEmail,
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
      const created = await createResource(db, mergeIntoInput(blank, row), actor);
      result.resourceId = created.id;
      result.detail = `${created.email}${created.emailVerified ? "" : " (sample)"}`;
    } else if (row.action === "update" && row.existing) {
      const [current] = await db.select().from(resources).where(eq(resources.id, row.existing.id));
      const { changed } = await updateResource(db, current.id, mergeIntoInput(toInput(current), row), actor, `Imported from ${batch.filename}`);
      if (changed.length === 0) result.outcome = "unchanged";
      else result.detail = `Changed: ${changed.join(", ")}`;
    }
  }

  await db
    .update(importBatches)
    .set({ status: "applied", appliedAt: new Date(), summary: counts, results })
    .where(eq(importBatches.id, batchId));
  return counts;
}

// ---- Bulk email update -------------------------------------------------

export type EmailPlanRow = {
  rowNumber: number;
  name: string;
  email: string;
  status: "update" | "unchanged" | "no_match" | "invalid_email" | "email_in_use";
  resource?: Pick<ResourceRow, "id" | "name" | "email" | "emailVerified">;
};

export function detectEmailColumns(headers: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return {
    name: lower.findIndex((h) => /^(full )?name\b/.test(h)),
    email: lower.findIndex((h) => /e-?mail/.test(h)),
  };
}

export async function planEmailImport(db: Db, rows: string[][], cols: { name: number; email: number }) {
  const all = await db.select().from(resources);
  const byKey = new Map(all.map((r) => [r.nameKey, r]));
  const byEmail = new Map(all.map((r) => [r.email, r]));

  return rows.map((row, i): EmailPlanRow => {
    const name = (row[cols.name] ?? "").trim();
    const email = (row[cols.email] ?? "").trim().toLowerCase();
    const base = { rowNumber: i + 2, name, email };
    const match = byKey.get(nameKey(name));
    if (!match) return { ...base, status: "no_match" };
    const resource = { id: match.id, name: match.name, email: match.email, emailVerified: match.emailVerified };
    if (!z.email().safeParse(email).success) return { ...base, status: "invalid_email", resource };
    if (match.email === email && match.emailVerified) return { ...base, status: "unchanged", resource };
    const owner = byEmail.get(email);
    if (owner && owner.id !== match.id) return { ...base, status: "email_in_use", resource };
    return { ...base, status: "update", resource };
  });
}

export async function applyEmailImport(db: Db, batchId: string, adminEmail: string) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch || !batch.mapping) throw new Error("Import not found.");
  if (batch.status === "applied") throw new Error("This import was already applied.");

  const plan = await planEmailImport(db, batch.rows, { name: batch.mapping.name, email: batch.mapping.email });
  let updated = 0;
  const results: ImportResult[] = plan.map((p) => ({
    rowNumber: p.rowNumber,
    name: p.name,
    outcome: p.status === "update" ? "updated" : p.status.replace(/_/g, " "),
    detail: p.email,
    resourceId: p.resource?.id,
  }));
  for (const row of plan) {
    if (row.status !== "update" || !row.resource) continue;
    const [current] = await db.select().from(resources).where(eq(resources.id, row.resource.id));
    await updateResource(
      db,
      current.id,
      { ...toInput(current), email: row.email, emailVerified: true },
      { email: adminEmail, source: "admin" },
      `Email updated from ${batch.filename}`,
    );
    updated++;
  }
  const summary = {
    rows: plan.length,
    updated,
    unchanged: plan.filter((p) => p.status === "unchanged").length,
    noMatch: plan.filter((p) => p.status === "no_match").length,
    invalid: plan.filter((p) => p.status === "invalid_email" || p.status === "email_in_use").length,
  };
  await db.update(importBatches).set({ status: "applied", appliedAt: new Date(), summary, results }).where(eq(importBatches.id, batchId));
  return summary;
}
