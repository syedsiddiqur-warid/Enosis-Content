import { and, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { resources, resourceVersions, type ResourceRow } from "@/db/schema";
import type { ResourceInput, Section, SectionUpdates } from "./types";

type Actor = { email: string; source: "admin" | "resource" | "import" };

/** Lowercased, accent- and punctuation-free name used to match people across imports. */
export function nameKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** firstname.lastname@domain, with a number appended if the address is already taken. */
export function sampleEmail(name: string, domain: string, taken: Set<string>) {
  const parts = nameKey(name).split(" ").filter(Boolean);
  const local = parts.length === 0 ? "resource" : parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`;
  let candidate = `${local}@${domain}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${local}${n}@${domain}`;
  taken.add(candidate);
  return candidate;
}

export async function takenEmails(db: Db) {
  const rows = await db.select({ email: resources.email }).from(resources);
  return new Set(rows.map((r) => r.email));
}

export const SECTION_FIELDS: Record<Section, (keyof ResourceInput)[]> = {
  personal: ["name", "email", "emailVerified", "title", "seniority"],
  experience: ["yearsPrevious", "yearsEnosis", "availabilityStatus", "availableFrom", "majorExpertise", "domains", "languages"],
  skills: ["skills"],
  education: ["education"],
  achievements: ["achievements"],
  projects: ["projects"],
};

/** JSON with object keys sorted, so values read back from JSONB (which reorders keys) compare equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

export function changedSections(before: Partial<ResourceInput> | null, after: ResourceInput): Section[] {
  return (Object.keys(SECTION_FIELDS) as Section[]).filter((section) =>
    SECTION_FIELDS[section].some((f) => stableJson(before?.[f] ?? null) !== stableJson(after[f] ?? null)),
  );
}

export function toInput(row: ResourceRow): ResourceInput {
  return {
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    title: row.title,
    seniority: row.seniority,
    yearsPrevious: row.yearsPrevious,
    yearsEnosis: row.yearsEnosis,
    availabilityStatus: row.availabilityStatus as ResourceInput["availabilityStatus"],
    availableFrom: row.availableFrom,
    majorExpertise: row.majorExpertise,
    domains: row.domains,
    languages: row.languages,
    skills: row.skills,
    education: row.education,
    achievements: row.achievements,
    projects: row.projects,
  };
}

function stampSections(existing: SectionUpdates, sections: Section[], by: Actor["source"]): SectionUpdates {
  const at = new Date().toISOString();
  const next = { ...existing };
  for (const s of sections) next[s] = { at, by };
  return next;
}

export async function createResource(db: Db, input: ResourceInput, actor: Actor) {
  const sections = changedSections(null, input);
  const [row] = await db
    .insert(resources)
    .values({
      ...input,
      nameKey: nameKey(input.name),
      sectionUpdates: stampSections({}, sections, actor.source),
      lastUpdatedBy: actor.source,
    })
    .returning();
  return row;
}

/** Updates a resource, first saving the previous state as a version. No-op if nothing changed. */
export async function updateResource(db: Db, id: string, input: ResourceInput, actor: Actor, note?: string) {
  const [current] = await db.select().from(resources).where(eq(resources.id, id));
  if (!current) throw new Error("Resource not found");

  const sections = changedSections(toInput(current), input);
  if (sections.length === 0) return { row: current, changed: [] as Section[] };

  return db.transaction(async (tx) => {
    const [{ latest }] = await tx
      .select({ latest: max(resourceVersions.version) })
      .from(resourceVersions)
      .where(eq(resourceVersions.resourceId, id));
    await tx.insert(resourceVersions).values({
      resourceId: id,
      version: (latest ?? 0) + 1,
      snapshot: toInput(current),
      changedBy: actor.email,
      source: actor.source,
      note: note ?? `Updated: ${sections.join(", ")}`,
    });
    const [row] = await tx
      .update(resources)
      .set({
        ...input,
        nameKey: nameKey(input.name),
        sectionUpdates: stampSections(current.sectionUpdates, sections, actor.source),
        lastUpdatedBy: actor.source,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, id))
      .returning();
    return { row, changed: sections };
  });
}

/**
 * Records that the person confirmed these sections are still correct, without changing data.
 * Refreshes their freshness dates so the record is no longer considered stale.
 */
export async function confirmSections(db: Db, id: string, sections: Section[], by: Actor["source"]) {
  const [current] = await db.select().from(resources).where(eq(resources.id, id));
  if (!current) throw new Error("Resource not found");
  await db
    .update(resources)
    .set({ sectionUpdates: stampSections(current.sectionUpdates, sections, by), lastUpdatedBy: by, updatedAt: new Date() })
    .where(eq(resources.id, id));
}

export async function getResource(db: Db, id: string) {
  const [row] = await db.select().from(resources).where(eq(resources.id, id));
  return row ?? null;
}

export async function getVersions(db: Db, id: string) {
  return db
    .select()
    .from(resourceVersions)
    .where(eq(resourceVersions.resourceId, id))
    .orderBy(desc(resourceVersions.version));
}

export async function setArchived(db: Db, id: string, archived: boolean) {
  await db
    .update(resources)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(resources.id, id));
}

export type ResourceFilters = {
  q?: string;
  skill?: string;
  seniority?: string;
  availability?: string;
  stale?: boolean;
  archived?: boolean;
  staleAfterDays: number;
};

export function isStale(row: Pick<ResourceRow, "updatedAt">, staleAfterDays: number) {
  return Date.now() - row.updatedAt.getTime() > staleAfterDays * 24 * 60 * 60 * 1000;
}

/** Small dataset (~150 people), so text and skill filtering happens in memory. */
export async function listResources(db: Db, f: ResourceFilters) {
  const rows = await db
    .select()
    .from(resources)
    .where(and(f.archived ? isNotNull(resources.archivedAt) : isNull(resources.archivedAt)))
    .orderBy(resources.name);

  const q = f.q?.trim().toLowerCase();
  const skill = f.skill?.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && ![r.name, r.email, r.title, r.majorExpertise].some((v) => v.toLowerCase().includes(q))) return false;
    if (skill && !r.skills.some((s) => s.name.toLowerCase().includes(skill)) && !r.projects.some((p) => p.technologies.some((t) => t.toLowerCase().includes(skill))))
      return false;
    if (f.seniority && r.seniority !== f.seniority) return false;
    if (f.availability && r.availabilityStatus !== f.availability) return false;
    if (f.stale && !isStale(r, f.staleAfterDays)) return false;
    return true;
  });
}
