CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"section" text NOT NULL,
	"section_label" text NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"author" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"request_id" uuid,
	"round" integer NOT NULL,
	"base_version" integer NOT NULL,
	"working_content" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"overall_comment" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"reviewer_edit_version" integer,
	"revision_version" integer,
	"revision_error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_items_review_idx" ON "review_items" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_profile_idx" ON "reviews" USING btree ("profile_id");