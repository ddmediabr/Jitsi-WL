ALTER TABLE "room_moderators" ADD COLUMN "role" text DEFAULT 'moderator' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "exclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_moderators" ADD CONSTRAINT "room_moderators_role_chk" CHECK ("role" IN ('moderator', 'member'));
