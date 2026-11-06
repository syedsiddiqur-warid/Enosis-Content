ALTER TABLE "access_requests" ADD COLUMN "base_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "draft_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "submission" jsonb;