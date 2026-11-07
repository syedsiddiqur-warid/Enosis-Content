"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { CanvaError, disconnect, getCanvaMapping, getDataset, saveCanvaMapping } from "@/lib/export/canva";
import { PROFILE_FIELDS, guessField } from "@/lib/export/fields";

function done(q: string) {
  revalidatePath("/admin/settings/canva");
  redirect(`/admin/settings/canva?${q}`);
}

/** Picks a brand template and reads its data fields, pre-mapping the ones whose names we recognize. */
export async function selectTemplateAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("templateId") ?? "");
  const title = String(formData.get("templateTitle") ?? "");
  const db = await getDb();
  let dataset: Record<string, { type: string }>;
  try {
    dataset = await getDataset(db, id);
  } catch (err) {
    done(`error=${encodeURIComponent(err instanceof CanvaError ? err.message : "Couldn't read the template's fields.")}`);
    return;
  }
  const fields = Object.fromEntries(Object.entries(dataset).map(([name, f]) => [name, f.type === "text" ? guessField(name) : ""]));
  const fieldTypes = Object.fromEntries(Object.entries(dataset).map(([name, f]) => [name, f.type]));
  await saveCanvaMapping(db, { brandTemplateId: id, brandTemplateTitle: title, fields, fieldTypes }, session.email);
  done("saved=template");
}

export async function saveFieldMappingAction(formData: FormData) {
  const session = await requireAdmin();
  const db = await getDb();
  const current = await getCanvaMapping(db);
  const valid = new Set(PROFILE_FIELDS.map((f) => f.key));
  const fields = { ...current.fields };
  for (const name of Object.keys(current.fields)) {
    const v = String(formData.get(`map.${name}`) ?? "");
    fields[name] = valid.has(v) ? v : "";
  }
  await saveCanvaMapping(db, { ...current, fields }, session.email);
  done("saved=mapping");
}

export async function disconnectCanvaAction() {
  await requireAdmin();
  await disconnect(await getDb());
  done("disconnected=1");
}
