CREATE TABLE "recording_starts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room" text NOT NULL,
	"username" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "recording_starts_room_at_idx" ON "recording_starts" USING btree ("room","at");
