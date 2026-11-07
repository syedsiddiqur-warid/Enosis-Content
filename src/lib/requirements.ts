import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accessRequests, requirementCandidates, requirements, resources } from "@/db/schema";

export { ENGAGEMENT_TYPES, REQUIREMENT_STATUSES, requirementInputSchema, type RequirementInput } from "./requirement-types";
import type { RequirementInput } from "./requirement-types";

export async function createRequirement(db: Db, input: RequirementInput, adminEmail: string) {
  const [row] = await db.insert(requirements).values({ ...input, createdBy: adminEmail }).returning();
  return row;
}

export async function updateRequirement(db: Db, id: string, input: RequirementInput) {
  await db.update(requirements).set({ ...input, updatedAt: new Date() }).where(eq(requirements.id, id));
}

export async function getRequirement(db: Db, id: string) {
  const [row] = await db.select().from(requirements).where(eq(requirements.id, id));
  return row ?? null;
}

export async function listRequirements(db: Db) {
  return db
    .select({
      requirement: requirements,
      candidates: sql<number>`(select count(*)::int from ${requirementCandidates} where ${requirementCandidates.requirementId} = ${requirements.id})`,
    })
    .from(requirements)
    .orderBy(desc(requirements.createdAt));
}

export async function listCandidates(db: Db, requirementId: string) {
  return db
    .select({ candidate: requirementCandidates, resource: resources })
    .from(requirementCandidates)
    .innerJoin(resources, eq(requirementCandidates.resourceId, resources.id))
    .where(eq(requirementCandidates.requirementId, requirementId))
    .orderBy(requirementCandidates.createdAt);
}

export async function addCandidates(db: Db, requirementId: string, picks: { resourceId: string; score?: number }[], adminEmail: string) {
  if (picks.length === 0) return;
  await db
    .insert(requirementCandidates)
    .values(picks.map((p) => ({ requirementId, resourceId: p.resourceId, scoreAtSelection: p.score, addedBy: adminEmail })))
    .onConflictDoNothing();
}

export async function removeCandidate(db: Db, requirementId: string, resourceId: string) {
  await db.delete(requirementCandidates).where(and(eq(requirementCandidates.requirementId, requirementId), eq(requirementCandidates.resourceId, resourceId)));
}

/** Latest update request per resource for this requirement. */
export async function requestsForRequirement(db: Db, requirementId: string, resourceIds: string[]) {
  if (resourceIds.length === 0) return new Map<string, typeof accessRequests.$inferSelect>();
  const rows = await db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.requirementId, requirementId), inArray(accessRequests.resourceId, resourceIds)))
    .orderBy(desc(accessRequests.createdAt));
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.resourceId && !map.has(r.resourceId)) map.set(r.resourceId, r);
  return map;
}

/** Requirements a resource is proposed for, newest first. */
export async function requirementsForResource(db: Db, resourceId: string) {
  return db
    .select({ requirement: requirements })
    .from(requirementCandidates)
    .innerJoin(requirements, eq(requirementCandidates.requirementId, requirements.id))
    .where(eq(requirementCandidates.resourceId, resourceId))
    .orderBy(desc(requirementCandidates.createdAt));
}

/** Every skill and technology name we already have, for suggestions and job-description scanning. */
export async function skillVocabulary(db: Db) {
  const rows = await db.select({ skills: resources.skills, projects: resources.projects }).from(resources);
  const names = new Map<string, string>();
  for (const r of rows) {
    for (const s of r.skills) names.set(s.name.toLowerCase(), names.get(s.name.toLowerCase()) ?? s.name);
    for (const p of r.projects) for (const t of p.technologies) names.set(t.toLowerCase(), names.get(t.toLowerCase()) ?? t);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
