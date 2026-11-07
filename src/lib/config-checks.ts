import "server-only";
import { env, isLocalUrl } from "./env";
import { canvaConfigured } from "./export/canva";
import { findBrowser } from "./export/html-pdf";

export type ConfigIssue = { level: "error" | "warning" | "info"; message: string };

const DEV_SECRET = "dev-only-secret-change-me";
const PROVIDER_KEY = { resend: "RESEND_API_KEY", postmark: "POSTMARK_SERVER_TOKEN", sendgrid: "SENDGRID_API_KEY" } as const;

/**
 * Setup problems, shown on the dashboard and logged at startup.
 * Errors are things that make the app unsafe or broken when deployed; warnings limit a feature.
 */
export function configIssues(): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const deployed = env.isProduction && !isLocalUrl(env.appUrl);
  const add = (level: ConfigIssue["level"], message: string) => issues.push({ level, message });

  if (env.adminEmails.length === 0 && !env.adminAllowedDomain) add("error", "No admin can sign in: set ADMIN_EMAILS or ADMIN_ALLOWED_DOMAIN.");

  if (env.secretKey === DEV_SECRET || env.secretKey.length < 32) {
    add(deployed ? "error" : "warning", "SECRET_KEY is missing or short. Set a random value of at least 32 characters (it encrypts Canva tokens and signs print links).");
  }
  if (deployed && ["talent-profile-studio", "change-me"].includes(env.auditSalt)) add("warning", "AUDIT_SALT uses the default value. Set a random value so visitor IP hashes can't be reversed by guessing.");

  if (env.isProduction && !process.env.APP_URL) add("error", "APP_URL is not set, so emailed links would point to localhost.");
  else if (deployed && !env.appUrl.startsWith("https://")) add("error", "APP_URL should use https:// so links and sign-in cookies are protected.");

  if (env.emailProvider === "dev") {
    if (deployed) add("error", "EMAIL_PROVIDER=dev: no real email is sent and the dev inbox is turned off on a deployed site. Choose resend, postmark, or sendgrid.");
  } else if (!process.env[PROVIDER_KEY[env.emailProvider]]) {
    add("error", `EMAIL_PROVIDER=${env.emailProvider} but ${PROVIDER_KEY[env.emailProvider]} is not set, so no email can be sent.`);
  }

  if (!env.cronSecret) add("warning", "CRON_SECRET is not set, so automatic reminders can't run. You can still send reminders from the dashboard.");
  if (deployed && !process.env.DATABASE_URL) add("warning", "DATABASE_URL is not set, so data is kept in the local PGlite folder. Use Postgres (e.g. Supabase) for a deployed site.");
  if (env.aiMode === "offline") add("warning", "AI is in offline mode (no ANTHROPIC_API_KEY): generated profiles are simple drafts built from the record, without Claude.");
  if (!findBrowser()) add("warning", "No Chrome or Edge found for the in-app PDF. Set CHROME_PATH or install Chromium on the server.");
  if (!canvaConfigured()) add("info", "Canva export isn't set up (optional). The in-app PDF is used instead.");

  return issues;
}
