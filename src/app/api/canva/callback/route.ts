import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { CanvaError, connectWithCode } from "@/lib/export/canva";

export const dynamic = "force-dynamic";

const pending = z.object({ verifier: z.string(), admin: z.string(), returnTo: z.string(), expiresAt: z.number() });

/** Canva redirects here after the admin approves. Exchanges the code for tokens and stores them encrypted. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const db = await getDb();

  const key = `canva_oauth:${hashToken(state)}`;
  const [row] = state ? await db.select().from(appSettings).where(eq(appSettings.key, key)) : [];
  if (row) await db.delete(appSettings).where(eq(appSettings.key, key)); // single use
  const parsed = pending.safeParse(row?.value);
  const back = (returnTo: string, q: string) => NextResponse.redirect(`${returnTo}/admin/settings/canva?${q}`);
  const fallbackOrigin = env.isProduction ? env.appUrl : url.origin;

  if (!parsed.success || parsed.data.expiresAt < Date.now()) return back(fallbackOrigin, "error=state");
  // Only return to an origin we trust: the configured app URL or the local dev server.
  const returnTo = env.isProduction ? env.appUrl : parsed.data.returnTo;
  if (!code) return back(returnTo, `error=${encodeURIComponent(url.searchParams.get("error") ?? "denied")}`);

  try {
    await connectWithCode(db, code, parsed.data.verifier, parsed.data.admin);
  } catch (err) {
    return back(returnTo, `error=${encodeURIComponent(err instanceof CanvaError ? err.message : "Couldn't connect to Canva.")}`);
  }
  return back(returnTo, "connected=1");
}
