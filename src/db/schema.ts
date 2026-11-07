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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  Achievement,
  Education,
  Project,
  ResourceInput,
  SectionUpdates,
  Skill,
} from "@/lib/resources/types";
import type { FactCheck, ProfileContent } from "@/lib/profiles/types";

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

/** A prospect's staffing need. Resources are matched against it and proposed with tailored profiles. */
export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientName: text("client_name").notNull(),
  roleTitle: text("role_title").notNull(),
  mustHaveSkills: jsonb("must_have_skills").$type<string[]>().notNull().default([]),
  niceToHaveSkills: jsonb("nice_to_have_skills").$type<string[]>().notNull().default([]),
  minYears: real("min_years"),
  domain: text("domain").notNull().default(""),
  engagementType: text("engagement_type").notNull().default(""),
  deadline: date("deadline"),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("open"), // open | submitted | won | lost | closed
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

/** A resource the admin chose to propose for a requirement. Phase 5 attaches the tailored profile. */
export const requirementCandidates = pgTable(
  "requirement_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    // Score and reasons when the admin picked them, for later reference.
    scoreAtSelection: integer("score_at_selection"),
    note: text("note").notNull().default(""),
    addedBy: text("added_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("requirement_candidates_unique").on(t.requirementId, t.resourceId)],
);

export type RequirementRow = typeof requirements.$inferSelect;

/** One tailored profile per resource per requirement. Content lives in versions. */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("generated"),
    currentVersion: integer("current_version").notNull().default(0),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("profiles_requirement_resource_unique").on(t.requirementId, t.resourceId)],
);

export const profileVersions = pgTable(
  "profile_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").$type<ProfileContent>().notNull(),
    gaps: jsonb("gaps").$type<string[]>().notNull().default([]),
    factCheck: jsonb("fact_check").$type<FactCheck>(),
    source: text("source").notNull(), // ai | offline | admin_edit | ai_revision
    // The record the profile was written from, for fact-checking and traceability.
    resourceSnapshot: jsonb("resource_snapshot").$type<ResourceInput>().notNull(),
    aiCallId: uuid("ai_call_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("profile_versions_unique").on(t.profileId, t.version)],
);

/** Every Claude API call: what was sent, what came back, and how it went. */
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(), // generate | fact_check | revise
  requirementId: uuid("requirement_id"),
  resourceId: uuid("resource_id"),
  profileId: uuid("profile_id"),
  resourceUpdatedAt: timestamp("resource_updated_at", { withTimezone: true }),
  model: text("model").notNull(),
  attempt: integer("attempt").notNull().default(1),
  request: jsonb("request").notNull(),
  response: jsonb("response"),
  status: text("status").notNull(), // ok | invalid | refusal | error
  error: text("error"),
  usage: jsonb("usage"),
  durationMs: integer("duration_ms"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProfileRow = typeof profiles.$inferSelect;
export type ProfileVersionRow = typeof profileVersions.$inferSelect;

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
    requirementId: uuid("requirement_id").references(() => requirements.id, { onDelete: "set null" }),
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
    // Resource update form (phase 3): the record as first shown, the autosaved draft, and the final submission.
    baseSnapshot: jsonb("base_snapshot").$type<ResourceInput>(),
    draft: jsonb("draft").$type<UpdateDraft>(),
    draftSavedAt: timestamp("draft_saved_at", { withTimezone: true }),
    submission: jsonb("submission").$type<UpdateSubmission>(),
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
export type UpdateDraft = { data: ResourceInput; reviewed: string[]; step: number };
export type UpdateSubmission = {
  before: ResourceInput;
  after: ResourceInput;
  changedSections: string[];
  confirmedSections: string[];
  submittedAt: string;
};
export type AccessRequestRow = typeof accessRequests.$inferSelect;

export type ImportResult = { rowNumber: number; name: string; outcome: string; detail?: string; resourceId?: string };

export type ResourceRow = typeof resources.$inferSelect;
export type NewResourceRow = typeof resources.$inferInsert;
