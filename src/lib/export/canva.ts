import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appSettings, canvaConnections } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Canva Connect API client: OAuth (authorization code + PKCE), brand templates, autofill, and export.
 * Autofill and brand templates need the connected Canva user to be on Canva Pro, Teams, or Enterprise.
 */

const API = "https://api.canva.com/rest/v1";
export const CANVA_SCOPES = ["brandtemplate:meta:read", "brandtemplate:content:read", "design:content:write", "design:content:read", "design:meta:read"];

export class CanvaError extends Error {}

export function canvaConfigured() {
  return !!(env.canvaClientId && env.canvaClientSecret);
}

export function pkcePair() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(64))).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string) {
  const q = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "s256",
    scope: CANVA_SCOPES.join(" "),
    response_type: "code",
    client_id: env.canvaClientId,
    state,
    redirect_uri: env.canvaRedirectUri,
  });
  return `https://www.canva.com/api/oauth/authorize?${q}`;
}

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string(), expires_in: z.number(), scope: z.string().optional() });

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.canvaClientId}:${env.canvaClientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new CanvaError(`Canva sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return tokenSchema.parse(await res.json());
}

async function saveTokens(db: Db, t: z.infer<typeof tokenSchema>, by: string) {
  const values = {
    id: "default",
    accessTokenEnc: encrypt(t.access_token, env.secretKey),
    refreshTokenEnc: encrypt(t.refresh_token, env.secretKey),
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scope: t.scope ?? "",
    connectedBy: by,
  };
  await db.insert(canvaConnections).values(values).onConflictDoUpdate({ target: canvaConnections.id, set: values });
}

export async function connectWithCode(db: Db, code: string, verifier: string, adminEmail: string) {
  await saveTokens(db, await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: env.canvaRedirectUri }), adminEmail);
}

export async function getConnection(db: Db) {
  const [row] = await db.select().from(canvaConnections).where(eq(canvaConnections.id, "default"));
  return row ?? null;
}

export async function disconnect(db: Db) {
  await db.delete(canvaConnections).where(eq(canvaConnections.id, "default"));
}

/** A valid access token, refreshing it when it's about to expire (refresh tokens are single-use, so the new one is saved). */
async function accessToken(db: Db) {
  const conn = await getConnection(db);
  if (!conn) throw new CanvaError("Canva isn't connected. Connect it in Settings → Canva.");
  if (conn.expiresAt.getTime() - Date.now() > 60_000) return decrypt(conn.accessTokenEnc, env.secretKey);
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(conn.refreshTokenEnc, env.secretKey) });
  await saveTokens(db, fresh, conn.connectedBy);
  return fresh.access_token;
}

async function api<T>(db: Db, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${await accessToken(db)}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new CanvaError("Canva rejected the saved sign-in. Reconnect Canva in Settings.");
  if (res.status === 403) throw new CanvaError("The connected Canva account isn't allowed to do this. Brand templates and autofill need Canva Pro, Teams, or Enterprise, and the scopes enabled on the integration.");
  if (!res.ok) throw new CanvaError(`Canva API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export type BrandTemplate = { id: string; title: string; view_url?: string; thumbnail?: { url: string } };

export async function listBrandTemplates(db: Db, query?: string) {
  const q = new URLSearchParams({ dataset: "non_empty", ...(query ? { query } : {}) });
  const data = await api<{ items: BrandTemplate[] }>(db, `/brand-templates?${q}`);
  return data.items;
}

export async function getDataset(db: Db, templateId: string) {
  const data = await api<{ dataset?: Record<string, { type: string }> }>(db, `/brand-templates/${encodeURIComponent(templateId)}/dataset`);
  return data.dataset ?? {};
}

type Job<R> = { job: { id: string; status: "in_progress" | "success" | "failed"; error?: { code: string; message: string } } & R };

async function poll<R>(db: Db, path: string, timeoutMs = 90_000): Promise<Job<R>["job"]> {
  const started = Date.now();
  for (let wait = 1000; ; wait = Math.min(wait * 1.5, 4000)) {
    const { job } = await api<Job<R>>(db, path);
    if (job.status === "success") return job;
    if (job.status === "failed") throw new CanvaError(`Canva job failed: ${job.error?.message ?? job.error?.code ?? "unknown error"}`);
    if (Date.now() - started > timeoutMs) throw new CanvaError("Canva took too long to respond. Please try again.");
    await new Promise((r) => setTimeout(r, wait));
  }
}

type Design = { id: string; url?: string; urls?: { edit_url: string; view_url: string } };

/** Fills the brand template with text, then exports the new design as a PDF. */
export async function autofillAndExport(db: Db, templateId: string, title: string, data: Record<string, string>) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, text]) => [k, { type: "text", text }]));
  const created = await api<Job<object>>(db, "/autofills", { method: "POST", body: { brand_template_id: templateId, title: title.slice(0, 255), data: fields } });
  const autofill = await poll<{ result?: { design: Design } }>(db, `/autofills/${created.job.id}`);
  const design = autofill.result?.design;
  if (!design) throw new CanvaError("Canva didn't return the new design.");

  const exp = await api<Job<object>>(db, "/exports", { method: "POST", body: { design_id: design.id, format: { type: "pdf", export_quality: "regular" } } });
  const exported = await poll<{ urls?: string[] }>(db, `/exports/${exp.job.id}`);
  const url = exported.urls?.[0];
  if (!url) throw new CanvaError("Canva didn't return a download link.");
  const pdf = await fetch(url);
  if (!pdf.ok) throw new CanvaError(`Couldn't download the PDF from Canva (${pdf.status}).`);
  return { design, pdf: Buffer.from(await pdf.arrayBuffer()) };
}

// ---- Template mapping (Settings → Canva) ----

export const canvaMappingSchema = z.object({
  brandTemplateId: z.string().default(""),
  brandTemplateTitle: z.string().default(""),
  // Canva dataset field name → profile field key (lib/export/fields)
  fields: z.record(z.string(), z.string()).default({}),
  fieldTypes: z.record(z.string(), z.string()).default({}),
});
export type CanvaMapping = z.infer<typeof canvaMappingSchema>;

export async function getCanvaMapping(db: Db): Promise<CanvaMapping> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "canva"));
  const parsed = canvaMappingSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : canvaMappingSchema.parse({});
}

export async function saveCanvaMapping(db: Db, value: CanvaMapping, by: string) {
  await db
    .insert(appSettings)
    .values({ key: "canva", value, updatedBy: by })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}
