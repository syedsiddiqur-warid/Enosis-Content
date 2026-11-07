import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { hashToken, randomToken } from "@/lib/crypto";
import { authorizeUrl, canvaConfigured, pkcePair } from "@/lib/export/canva";

export const dynamic = "force-dynamic";

/**
 * Starts "Connect Canva". The PKCE verifier is kept server-side under a hash of the one-time state
 * (not in a cookie), so the callback works even when Canva redirects to a different local host name.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (!canvaConfigured()) return NextResponse.redirect(new URL("/admin/settings/canva?error=not_configured", req.url));

  const state = randomToken();
  const { verifier, challenge } = pkcePair();
  const db = await getDb();
  await db.insert(appSettings).values({
    key: `canva_oauth:${hashToken(state)}`,
    value: { verifier, admin: session.email, returnTo: new URL(req.url).origin, expiresAt: Date.now() + 10 * 60 * 1000 },
    updatedBy: session.email,
  });
  return NextResponse.redirect(authorizeUrl(state, challenge));
}
