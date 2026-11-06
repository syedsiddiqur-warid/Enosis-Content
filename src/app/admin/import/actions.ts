"use server";

import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { importBatches } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { autoDetectMapping } from "@/lib/import/google-form";
import { applyEmailImport, applyResourceImport, detectEmailColumns } from "@/lib/import/resources-import";

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCsvAction(formData: FormData) {
  const session = await requireAdmin();
  const kind = formData.get("kind") === "emails" ? "emails" : "resources";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/admin/import?error=${encodeURIComponent("Please choose a CSV file.")}`);
  if (file.size > MAX_BYTES) redirect(`/admin/import?error=${encodeURIComponent("The file is larger than 5 MB.")}`);

  const text = (await file.text()).replace(/^﻿/, "");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const [headers, ...rows] = result.data;
  if (!headers || rows.length === 0) redirect(`/admin/import?error=${encodeURIComponent("The CSV has no data rows.")}`);

  const mapping =
    kind === "resources" ? autoDetectMapping(headers) : (() => {
      const cols = detectEmailColumns(headers);
      return cols.name >= 0 && cols.email >= 0 ? cols : null;
    })();

  const db = await getDb();
  const [batch] = await db
    .insert(importBatches)
    .values({ kind, filename: file.name, headers, rows, mapping, createdBy: session.email })
    .returning({ id: importBatches.id });
  redirect(`/admin/import/${batch.id}`);
}

export async function saveMappingAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const mapping: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("map.") && value !== "") mapping[key.slice(4)] = Number(value);
  }
  const db = await getDb();
  await db.update(importBatches).set({ mapping }).where(eq(importBatches.id, id));
  redirect(`/admin/import/${id}?step=preview`);
}

export async function applyImportAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const db = await getDb();
  const [batch] = await db.select({ kind: importBatches.kind }).from(importBatches).where(eq(importBatches.id, id));
  if (batch?.kind === "emails") await applyEmailImport(db, id, session.email);
  else await applyResourceImport(db, id, session.email, env.sampleEmailDomain);
  revalidatePath("/admin/resources");
  redirect(`/admin/import/${id}`);
}
