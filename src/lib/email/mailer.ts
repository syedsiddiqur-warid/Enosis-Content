import "server-only";
import { getDb } from "@/db";
import { outboundEmails } from "@/db/schema";
import { env } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Set false for generated sample addresses. Those are guesses on a real domain,
   * so they only ever reach the dev inbox and are blocked by real providers.
   */
  recipientVerified: boolean;
};

export type SendResult = { status: "dev_inbox" | "sent" | "blocked" | "failed"; error?: string };

/**
 * Phase 1 ships the dev provider (messages are stored and shown at /dev/inbox).
 * Real providers (Resend, Postmark, SendGrid) plug in here in phase 2.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const db = await getDb();
  let result: SendResult;

  if (env.emailProvider === "dev") {
    result = { status: "dev_inbox" };
    console.log(`\n[dev inbox] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
  } else if (!email.recipientVerified) {
    result = { status: "blocked", error: "Recipient email is a sample/unverified address." };
  } else {
    result = { status: "failed", error: `Email provider "${env.emailProvider}" is not implemented yet.` };
  }

  await db.insert(outboundEmails).values({
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    provider: env.emailProvider,
    status: result.status,
    error: result.error,
  });
  return result;
}
