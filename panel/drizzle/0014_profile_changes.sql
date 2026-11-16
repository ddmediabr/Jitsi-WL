ALTER TABLE "jitsi_profiles" ADD COLUMN "name_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jitsi_profiles" ADD COLUMN "name_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jitsi_profiles" ADD COLUMN "photo_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jitsi_profiles" ADD COLUMN "photo_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jitsi_profiles" ADD COLUMN "photo_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "jitsi_photos" (
	"username" text PRIMARY KEY NOT NULL,
	"data" bytea NOT NULL,
	"mime" text DEFAULT 'image/webp' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
