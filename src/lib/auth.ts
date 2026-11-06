import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { loginTokens, sessions } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { baseUrl } from "@/lib/url";

export const SESSION_COOKIE = "tps_session";
const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function isAllowedAdmin(email: string) {
  const e = email.trim().toLowerCase();
  if (env.adminEmails.includes(e)) return true;
  return !!env.adminAllowedDomain && e.endsWith(`@${env.adminAllowedDomain}`);
}

/** Sends a one-time sign-in link. Silently does nothing for emails that aren't allowed. */
export async function requestLoginLink(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!isAllowedAdmin(normalized)) return;

  const token = randomToken();
  const db = await getDb();
  await db.insert(loginTokens).values({
    tokenHash: hashToken(token),
    email: normalized,
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
  });

  const link = `${await baseUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: normalized,
    subject: "Your sign-in link for Talent Profile Studio",
    text: `Hi,\n\nUse this link to sign in to Talent Profile Studio. It works once and expires in 15 minutes.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    recipientVerified: true,
  });
}

/** Consumes a login token and starts a session. Returns false if the link is invalid, used, or expired. */
export async function signInWithToken(token: string) {
  const db = await getDb();
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(loginTokens.tokenHash, hashToken(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row || !isAllowedAdmin(row.email)) return false;

  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(sessionToken), email: row.email, expiresAt });

  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    expires: expiresAt,
  });
  return true;
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row || !isAllowedAdmin(row.email)) return null;
  return { email: row.email };
});

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}
