ALTER TABLE "rooms" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "empty_timeout_min" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_kind_check" CHECK ("kind" IN ('permanent', 'temporary'));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_empty_timeout_check" CHECK ("empty_timeout_min" IS NULL OR "empty_timeout_min" IN (15, 30, 45, 60));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_temporary_check" CHECK ("kind" <> 'temporary' OR ("expires_at" IS NOT NULL AND "empty_timeout_min" IS NOT NULL));
