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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImportResult = { rowNumber: number; name: string; outcome: string; detail?: string; resourceId?: string };

export type ResourceRow = typeof resources.$inferSelect;
export type NewResourceRow = typeof resources.$inferInsert;
