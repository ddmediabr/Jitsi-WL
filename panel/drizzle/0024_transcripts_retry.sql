ALTER TABLE "transcripts" ADD COLUMN "round" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "next_run_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "notify_email" boolean DEFAULT false NOT NULL;
