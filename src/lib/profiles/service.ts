import "server-only";
import { and, desc, eq, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profileVersions, profiles, requirements, resources } from "@/db/schema";
import { env } from "@/lib/env";
import { toInput } from "@/lib/resources/service";
import { getAiSettings } from "@/lib/settings";
import { factCheck, ruleChecks } from "./fact-check";
import { generateProfile } from "./generate";
import { profileContentSchema, type FactFlag } from "./types";

export class ProfileError extends Error {}

async function nextVersion(db: Db, profileId: string) {
  const [{ latest }] = await db.select({ latest: max(profileVersions.version) }).from(profileVersions).where(eq(profileVersions.profileId, profileId));
  return (latest ?? 0) + 1;
}

/**
 * Generates (or regenerates) the tailored profile for a resource on a requirement, runs the
 * fact-check pass, and stores the result as a new version.
 */
export async function generateForCandidate(db: Db, requirementId: string, resourceId: string, adminEmail: string) {
  const [requirement] = await db.select().from(requirements).where(eq(requirements.id, requirementId));
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId));
  if (!requirement || !resource) throw new ProfileError("Requirement or resource not found.");

  const ai = await getAiSettings(db);
  const generated = await generateProfile(db, requirement, resource, ai, adminEmail, env.staleAfterDays);
  if ("error" in generated) throw new ProfileError(generated.error);

  let [profile] = await db.select().from(profiles).where(and(eq(profiles.requirementId, requirementId), eq(profiles.resourceId, resourceId)));
  if (!profile) [profile] = await db.insert(profiles).values({ requirementId, resourceId, createdBy: adminEmail }).returning();

  const record = toInput(resource);
  const check = await factCheck(db, generated.content, record, ai, { requirementId, resourceId, profileId: profile.id, adminEmail });
  // Limits the model still missed after its retries show up as low-severity flags.
  const leftover: FactFlag[] = generated.problems.map((p) => ({ section: "Generation", quote: "", issue: p, severity: "low", source: "rules" }));

  const version = await nextVersion(db, profile.id);
  await db.insert(profileVersions).values({
    profileId: profile.id,
    version,
    content: generated.content,
    gaps: generated.gaps,
    factCheck: { ...check, flags: [...check.flags, ...leftover] },
    source: generated.source,
    resourceSnapshot: record,
    aiCallId: generated.callId,
    createdBy: adminEmail,
  });
  await db.update(profiles).set({ currentVersion: version, status: "generated", updatedAt: new Date() }).where(eq(profiles.id, profile.id));
  return profile.id;
}

/** Saves an admin's manual edit as a new version and re-runs the rule-based checks. */
export async function saveEditedProfile(db: Db, profileId: string, raw: unknown, adminEmail: string) {
  const parsed = profileContentSchema.safeParse(raw);
  if (!parsed.success) throw new ProfileError("The edited profile is incomplete. Please check every section.");
  const current = await getProfile(db, profileId);
  if (!current?.version) throw new ProfileError("Profile not found.");
  const ai = await getAiSettings(db);
  const snapshot = current.version.resourceSnapshot;
  const version = await nextVersion(db, profileId);
  await db.insert(profileVersions).values({
    profileId,
    version,
    content: parsed.data,
    gaps: current.version.gaps,
    factCheck: { flags: ruleChecks(parsed.data, snapshot, ai), checkedAt: new Date().toISOString(), aiChecked: false, aiError: "Edited by an admin; run the AI fact check again if needed." },
    source: "admin_edit",
    resourceSnapshot: snapshot,
    createdBy: adminEmail,
  });
  await db.update(profiles).set({ currentVersion: version, updatedAt: new Date() }).where(eq(profiles.id, profileId));
}

/** Re-runs the full fact check (rules + AI) on the current version. */
export async function recheckProfile(db: Db, profileId: string, adminEmail: string) {
  const current = await getProfile(db, profileId);
  if (!current?.version) throw new ProfileError("Profile not found.");
  const ai = await getAiSettings(db);
  const check = await factCheck(db, current.version.content, current.version.resourceSnapshot, ai, {
    requirementId: current.profile.requirementId,
    resourceId: current.profile.resourceId,
    profileId,
    adminEmail,
  });
  await db.update(profileVersions).set({ factCheck: check }).where(eq(profileVersions.id, current.version.id));
}

export async function getProfile(db: Db, profileId: string, versionNumber?: number) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
  if (!profile) return null;
  const [version] = await db
    .select()
    .from(profileVersions)
    .where(and(eq(profileVersions.profileId, profileId), eq(profileVersions.version, versionNumber ?? profile.currentVersion)));
  const versions = await db
    .select({ version: profileVersions.version, source: profileVersions.source, createdAt: profileVersions.createdAt, createdBy: profileVersions.createdBy })
    .from(profileVersions)
    .where(eq(profileVersions.profileId, profileId))
    .orderBy(desc(profileVersions.version));
  return { profile, version: version ?? null, versions };
}

export async function profilesForRequirement(db: Db, requirementId: string) {
  const rows = await db.select().from(profiles).where(eq(profiles.requirementId, requirementId));
  return new Map(rows.map((p) => [p.resourceId, p]));
}

