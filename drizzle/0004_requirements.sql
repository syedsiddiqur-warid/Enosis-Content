CREATE TABLE "requirement_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"score_at_selection" integer,
	"note" text DEFAULT '' NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"role_title" text NOT NULL,
	"must_have_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_to_have_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_years" real,
	"domain" text DEFAULT '' NOT NULL,
	"engagement_type" text DEFAULT '' NOT NULL,
	"deadline" date,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "requirement_id" uuid;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_candidates_unique" ON "requirement_candidates" USING btree ("requirement_id","resource_id");--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;