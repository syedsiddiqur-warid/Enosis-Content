"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { createResource, setArchived, updateResource } from "@/lib/resources/service";
import { resourceInputSchema } from "@/lib/resources/types";

export type SaveState = { errors: string[] } | null;

export async function saveResourceAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "") || null;

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { errors: ["Could not read the form. Please try again."] };
  }

  const parsed = resourceInputSchema.safeParse(payload);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => `${i.path.join(" › ") || "Form"}: ${i.message}`) };
  }

  const db = await getDb();
  const actor = { email: session.email, source: "admin" as const };
  let savedId: string;
  try {
    if (id) {
      await updateResource(db, id, parsed.data, actor);
      savedId = id;
    } else {
      savedId = (await createResource(db, parsed.data, actor)).id;
    }
  } catch (err) {
    if (String(err).includes("resources_email_unique") || String((err as { cause?: unknown })?.cause).includes("resources_email_unique")) {
      return { errors: [`Another resource already uses ${parsed.data.email}.`] };
    }
    throw err;
  }

  revalidatePath("/admin/resources");
  redirect(`/admin/resources/${savedId}`);
}

export async function setArchivedAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const archived = formData.get("archived") === "true";
  await setArchived(await getDb(), id, archived);
  revalidatePath("/admin/resources");
  redirect(`/admin/resources/${id}`);
}
