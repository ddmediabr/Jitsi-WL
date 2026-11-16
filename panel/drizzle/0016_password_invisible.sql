ALTER TABLE "rooms" ADD COLUMN "password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jitsi_profiles" ADD COLUMN "invisible_allowed" boolean DEFAULT false NOT NULL;
