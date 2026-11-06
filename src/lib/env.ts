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
  emailProvider: (process.env.EMAIL_PROVIDER || "dev") as "dev" | "resend",
  emailFrom: process.env.EMAIL_FROM || "Enosis Talent Team <talent@enosisbd.com>",
  sampleEmailDomain: process.env.SAMPLE_EMAIL_DOMAIN || "enosisbd.com",
  staleAfterDays: Number(process.env.STALE_AFTER_DAYS || 60),
  isProduction: process.env.NODE_ENV === "production",
};

export const devInboxEnabled = env.emailProvider === "dev";
