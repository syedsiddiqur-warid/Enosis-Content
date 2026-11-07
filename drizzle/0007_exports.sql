CREATE TABLE "canva_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"connected_by" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"file_name" text NOT NULL,
	"pdf" "bytea",
	"size_bytes" integer,
	"canva_design_id" text,
	"canva_edit_url" text,
	"canva_view_url" text,
	"error" text,
	"duration_ms" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_exports" ADD CONSTRAINT "profile_exports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_exports_profile_idx" ON "profile_exports" USING btree ("profile_id");