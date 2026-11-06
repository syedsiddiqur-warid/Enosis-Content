import "server-only";
import { getDb } from "@/db";
import { outboundEmails } from "@/db/schema";
import { env } from "@/lib/env";
import { providers, type ProviderMessage } from "./providers";

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
  templateKey?: string;
  requestId?: string;
};

export type SendResult = { status: "dev_inbox" | "sent" | "blocked" | "failed"; error?: string };

/** Sends through EMAIL_PROVIDER and records every message (the record is the dev inbox in dev mode). */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  let result: SendResult;
  let providerMessageId: string | undefined;

  if (env.emailProvider === "dev") {
    result = { status: "dev_inbox" };
    console.log(`\n[dev inbox] To: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
  } else if (!email.recipientVerified) {
    result = { status: "blocked", error: "Recipient email is a sample/unverified address." };
  } else {
    const provider = providers[env.emailProvider];
    const message: ProviderMessage = { from: env.emailFrom, to: email.to, subject: email.subject, text: email.text, html: email.html };
    try {
      providerMessageId = await provider(message);
      result = { status: "sent" };
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
      console.error(`[email] ${env.emailProvider} failed for ${email.to}:`, result.error);
    }
  }

  const db = await getDb();
  await db.insert(outboundEmails).values({
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    provider: env.emailProvider,
    status: result.status,
    error: result.error,
    providerMessageId,
    templateKey: email.templateKey,
    requestId: email.requestId,
  });
  return result;
}
