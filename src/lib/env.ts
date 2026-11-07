import "server-only";

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  adminEmails: list(process.env.ADMIN_EMAILS),
  adminAllowedDomain: (process.env.ADMIN_ALLOWED_DOMAIN || "").trim().toLowerCase(),
  emailProvider: (process.env.EMAIL_PROVIDER || "dev") as "dev" | "resend" | "postmark" | "sendgrid",
  emailFrom: process.env.EMAIL_FROM || "Enosis Talent Team <talent@enosisbd.com>",
  sampleEmailDomain: process.env.SAMPLE_EMAIL_DOMAIN || "enosisbd.com",
  staleAfterDays: Number(process.env.STALE_AFTER_DAYS || 60),
  cronSecret: process.env.CRON_SECRET || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  // "offline" builds a simple draft from the record without calling Claude (for trying the app without an API key).
  aiMode: (process.env.AI_MODE || (process.env.ANTHROPIC_API_KEY ? "claude" : "offline")) as "claude" | "offline",
  // Used to hash visitor IPs in the link audit log, so raw IPs are never stored.
  auditSalt: process.env.AUDIT_SALT || "talent-profile-studio",
  // Encrypts stored Canva tokens and signs internal print URLs. Set a long random value in production.
  secretKey: process.env.SECRET_KEY || "dev-only-secret-change-me",
  canvaClientId: process.env.CANVA_CLIENT_ID || "",
  canvaClientSecret: process.env.CANVA_CLIENT_SECRET || "",
  // Must exactly match a redirect URL registered for the Canva integration.
  canvaRedirectUri: process.env.CANVA_REDIRECT_URI || "http://127.0.0.1:3100/api/canva/callback",
  // Optional: path to Chrome or Edge for the in-app PDF. Auto-detected when empty.
  chromePath: process.env.CHROME_PATH || "",
  isProduction: process.env.NODE_ENV === "production",
};

export const devInboxEnabled = env.emailProvider === "dev";
