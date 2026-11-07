import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profileExports, profiles } from "@/db/schema";
import { getProfile } from "@/lib/profiles/service";
import { CanvaError, autofillAndExport, canvaConfigured, getCanvaMapping, getConnection } from "./canva";
import { PROFILE_FIELDS } from "./fields";
import { findBrowser, renderProfilePdf } from "./html-pdf";

export type ExportMethod = "html" | "canva";

/** Whether each export method can run right now, and why not. */
export async function exportAvailability(db: Db) {
  const mapping = await getCanvaMapping(db);
  const canva = !canvaConfigured()
    ? "Canva isn't set up (CANVA_CLIENT_ID and CANVA_CLIENT_SECRET)."
    : !(await getConnection(db))
      ? "Canva isn't connected yet. Connect it in Settings → Canva."
      : !mapping.brandTemplateId || Object.values(mapping.fields).every((v) => !v)
        ? "Choose a brand template and map its fields in Settings → Canva."
        : null;
  const html = findBrowser() ? null : "No Chrome or Edge found on the server. Install Chrome or set CHROME_PATH.";
  return { canva, html };
}

function fileName(name: string, role: string, version: number, method: ExportMethod) {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} .\-]/gu, "").trim();
  return `${clean(name)} - ${clean(role)} - Enosis Profile v${version}${method === "canva" ? " (Canva)" : ""}.pdf`;
}

/**
 * Exports the current (approved) version. Canva fills the mapped brand template and exports a PDF;
 * if Canva fails, the in-app PDF is made instead from the same template the reviewer saw.
 */
export type ExportResult = { id: string; fellBack: boolean; canvaError?: string };

export async function exportProfile(db: Db, profileId: string, method: ExportMethod, adminEmail: string, roleTitle: string): Promise<ExportResult> {
  const data = await getProfile(db, profileId);
  if (!data?.version) throw new Error("Profile not found.");
  const { profile, version } = data;
  const started = Date.now();
  const base = { profileId, version: version.version, createdBy: adminEmail };

  if (method === "canva") {
    try {
      const mapping = await getCanvaMapping(db);
      const values = Object.fromEntries(
        Object.entries(mapping.fields)
          .filter(([, key]) => key)
          .map(([field, key]) => [field, PROFILE_FIELDS.find((f) => f.key === key)?.value(version.content) ?? ""]),
      );
      const { design, pdf } = await autofillAndExport(db, mapping.brandTemplateId, `${version.content.name} - ${roleTitle}`, values);
      const [row] = await db
        .insert(profileExports)
        .values({
          ...base,
          method: "canva",
          status: "done",
          fileName: fileName(version.content.name, roleTitle, version.version, "canva"),
          pdf,
          sizeBytes: pdf.length,
          canvaDesignId: design.id,
          canvaEditUrl: design.urls?.edit_url,
          canvaViewUrl: design.urls?.view_url ?? design.url,
          durationMs: Date.now() - started,
        })
        .returning({ id: profileExports.id });
      await markExported(db, profile.id);
      return { id: row.id, fellBack: false };
    } catch (err) {
      const message = err instanceof CanvaError ? err.message : err instanceof Error ? err.message : String(err);
      await db.insert(profileExports).values({ ...base, method: "canva", status: "failed", fileName: "", error: message, durationMs: Date.now() - started });
      const fallback = await exportProfile(db, profileId, "html", adminEmail, roleTitle);
      return { id: fallback.id, fellBack: true, canvaError: message };
    }
  }

  const pdf = await renderProfilePdf(profileId, version.version);
  const [row] = await db
    .insert(profileExports)
    .values({ ...base, method: "html", status: "done", fileName: fileName(version.content.name, roleTitle, version.version, "html"), pdf, sizeBytes: pdf.length, durationMs: Date.now() - started })
    .returning({ id: profileExports.id });
  await markExported(db, profile.id);
  return { id: row.id, fellBack: false };
}

async function markExported(db: Db, profileId: string) {
  await db.update(profiles).set({ status: "exported", updatedAt: new Date() }).where(eq(profiles.id, profileId));
}

export async function listExports(db: Db, profileId: string) {
  return db
    .select({
      id: profileExports.id,
      version: profileExports.version,
      method: profileExports.method,
      status: profileExports.status,
      fileName: profileExports.fileName,
      sizeBytes: profileExports.sizeBytes,
      canvaEditUrl: profileExports.canvaEditUrl,
      canvaViewUrl: profileExports.canvaViewUrl,
      error: profileExports.error,
      durationMs: profileExports.durationMs,
      createdBy: profileExports.createdBy,
      createdAt: profileExports.createdAt,
    })
    .from(profileExports)
    .where(eq(profileExports.profileId, profileId))
    .orderBy(desc(profileExports.createdAt));
}

export async function getExportFile(db: Db, id: string) {
  const [row] = await db
    .select({ pdf: profileExports.pdf, fileName: profileExports.fileName })
    .from(profileExports)
    .where(and(eq(profileExports.id, id), eq(profileExports.status, "done")));
  return row?.pdf ? row : null;
}
