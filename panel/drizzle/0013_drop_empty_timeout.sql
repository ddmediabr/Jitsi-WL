ALTER TABLE "rooms" DROP CONSTRAINT "rooms_temporary_check";--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_empty_timeout_check";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "empty_timeout_min";--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "last_active_at";--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_temporary_check" CHECK ("kind" <> 'temporary' OR "expires_at" IS NOT NULL);
