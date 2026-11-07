"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { resources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createResourceUpdateRequest, LinkError } from "@/lib/links/service";
import { scoreResource } from "@/lib/matching";
import {
  addCandidates,
  createRequirement,
  getRequirement,
  removeCandidate,
  requirementInputSchema,
  updateRequirement,
} from "@/lib/requirements";

export type FormState = { errors: string[] } | null;

export async function saveRequirementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "") || null;
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { errors: ["Could not read the form. Please try again."] };
  }
  const parsed = requirementInputSchema.safeParse(payload);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };

  const db = await getDb();
  let savedId = id;
  if (id) await updateRequirement(db, id, parsed.data);
  else savedId = (await createRequirement(db, parsed.data, session.email)).id;
  revalidatePath("/admin/requirements");
  redirect(`/admin/requirements/${savedId}`);
}

const idsSchema = z.array(z.uuid()).min(1);

function back(requirementId: string, notice: string) {
  revalidatePath(`/admin/requirements/${requirementId}`);
  redirect(`/admin/requirements/${requirementId}?notice=${encodeURIComponent(notice)}`);
}

/** Adds the resources the admin ticked in the shortlist. Nothing is ever selected automatically. */
export async function addCandidatesAction(formData: FormData) {
  const session = await requireAdmin();
  const requirementId = z.uuid().parse(formData.get("requirementId"));
  const ids = idsSchema.safeParse(formData.getAll("ids").map(String));
  if (!ids.success) back(requirementId, "Tick at least one person in the shortlist first.");

  const db = await getDb();
  const req = await getRequirement(db, requirementId);
  if (!req) back(requirementId, "Requirement not found.");
  const rows = await db.select().from(resources).where(inArray(resources.id, ids.data!));
  await addCandidates(
    db,
    requirementId,
    rows.map((r) => ({ resourceId: r.id, score: scoreResource(req!, r, env.staleAfterDays).score })),
    session.email,
  );
  back(requirementId, `Added ${rows.length} ${rows.length === 1 ? "person" : "people"} to the proposal.`);
}

/** Bound to the requirement and resource ids, because it runs from a button inside another form. */
export async function removeCandidateAction(requirementIdRaw: string, resourceIdRaw: string) {
  await requireAdmin();
  const requirementId = z.uuid().parse(requirementIdRaw);
  const resourceId = z.uuid().parse(resourceIdRaw);
  await removeCandidate(await getDb(), requirementId, resourceId);
  back(requirementId, "Removed from the proposal.");
}

/** Sends update requests to the selected candidates, using the requirement's role title and domain. */
export async function sendCandidateRequestsAction(formData: FormData) {
  const session = await requireAdmin();
  const requirementId = z.uuid().parse(formData.get("requirementId"));
  const ids = idsSchema.safeParse(formData.getAll("ids").map(String));
  const dueDate = String(formData.get("dueDate") ?? "");
  if (!ids.success) back(requirementId, "Tick at least one proposed person to send a request.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < new Date().toISOString().slice(0, 10)) back(requirementId, "Choose a due date that isn't in the past.");

  const db = await getDb();
  const req = await getRequirement(db, requirementId);
  if (!req) back(requirementId, "Requirement not found.");
  const rows = await db.select().from(resources).where(inArray(resources.id, ids.data!));
  const done: string[] = [];
  const problems: string[] = [];
  for (const r of rows) {
    try {
      const { email } = await createResourceUpdateRequest(
        db,
        r,
        { roleTitle: req!.roleTitle, clientIndustry: req!.domain || undefined, dueDate, requirementId },
        session.email,
      );
      if (email.status === "sent" || email.status === "dev_inbox") done.push(r.name);
      else problems.push(`${r.name}: email ${email.status}`);
    } catch (err) {
      if (!(err instanceof LinkError)) throw err;
      problems.push(err.message);
    }
  }
  back(requirementId, [done.length && `Update request sent to ${done.join(", ")}.`, ...problems].filter(Boolean).join(" "));
}
