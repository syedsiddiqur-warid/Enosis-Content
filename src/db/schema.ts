import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Achievement,
  Education,
  Project,
  SectionUpdates,
  Skill,
} from "@/lib/resources/types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * One row per person. List-shaped sections (skills, education, achievements,
 * projects) are stored as validated JSONB: they are always read and written as
 * a whole, versioned as a snapshot, and the dataset is small (~150 people).
 */
export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    email: text("email").notNull().unique(),
    // false = generated sample address (firstname.lastname@enosisbd.com); never send real mail to it.
    emailVerified: boolean("email_verified").notNull().default(false),
    title: text("title").notNull().default(""),
    seniority: text("seniority").notNull().default(""),
    yearsPrevious: real("years_previous"),
    yearsEnosis: real("years_enosis"),
    availabilityStatus: text("availability_status").notNull().default("unknown"),
    availableFrom: date("available_from"),
    majorExpertise: text("major_expertise").notNull().default(""),
    domains: jsonb("domains").$type<string[]>().notNull().default([]),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    skills: jsonb("skills").$type<Skill[]>().notNull().default([]),
    education: jsonb("education").$type<Education[]>().notNull().default([]),
    achievements: jsonb("achievements").$type<Achievement[]>().notNull().default([]),
    projects: jsonb("projects").$type<Project[]>().notNull().default([]),
    sectionUpdates: jsonb("section_updates").$type<SectionUpdates>().notNull().default({}),
    lastUpdatedBy: text("last_updated_by").notNull().default("admin"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("resources_name_key_idx").on(t.nameKey)],
);

/** Snapshot of a resource taken just before each change. */
export const resourceVersions = pgTable(
  "resource_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changedBy: text("changed_by").notNull(),
    source: text("source").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resource_versions_resource_idx").on(t.resourceId)],
);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // "resources" | "emails"
  filename: text("filename").notNull(),
  headers: jsonb("headers").$type<string[]>().notNull(),
  rows: jsonb("rows").$type<string[][]>().notNull(),
  mapping: jsonb("mapping").$type<Record<string, number>>(),
  status: text("status").notNull().default("uploaded"), // uploaded | applied
  summary: jsonb("summary").$type<Record<string, number>>(),
  // Per-row outcome recorded when the import is applied.
  results: jsonb("results").$type<ImportResult[]>(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every outgoing message. In dev mode this table is the inbox. */
export const outboundEmails = pgTable("outbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  html: text("html"),
  provider: text("provider").notNull(),
  status: text("status").notNull(), // dev_inbox | sent | blocked | failed
  error: text("error"),
  providerMessageId: text("provider_message_id"),
  templateKey: text("template_key"),
  requestId: uuid("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A task given to someone without an account: a resource asked to update their info,
 * or (phase 6) a reviewer asked to review a profile. Access is through secure link tokens.
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose").notNull(), // resource_update | profile_review
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id"), // the profile under review (phase 6)
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name").notNull(),
    context: jsonb("context").$type<RequestContext>().notNull().default({}),
    dueDate: date("due_date"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    openCount: integer("open_count").notNull().default(0),
    remindersSent: integer("reminders_sent").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    // Optional email code check (setting "requireOtp").
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    verifiedSessionHash: text("verified_session_hash"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [index("access_requests_resource_idx").on(t.resourceId)],
);

/** Only the SHA-256 hash of each link token is stored. A request can have several valid tokens (resends, reminders). */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => accessRequests.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    reason: text("reason").notNull(), // initial | resend | reminder
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_tokens_request_idx").on(t.requestId)],
);

/** Audit log for link activity: sent, opened, code sent/verified, submitted, reminded, revoked. */
export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => accessRequests.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id"),
    type: text("type").notNull(),
    detail: text("detail"),
    actor: text("actor"), // admin email, or null for the link holder
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_events_request_idx").on(t.requestId)],
);

/** Editable message wording. Keys are fixed; admins change subject and body. */
export const messageTemplates = pgTable("message_templates", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestContext = { roleTitle?: string; clientIndustry?: string; resourceName?: string };
export type AccessRequestRow = typeof accessRequests.$inferSelect;

export type ImportResult = { rowNumber: number; name: string; outcome: string; detail?: string; resourceId?: string };

export type ResourceRow = typeof resources.$inferSelect;
export type NewResourceRow = typeof resources.$inferInsert;
