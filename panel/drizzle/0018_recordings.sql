CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room" text NOT NULL,
	"session_id" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_seconds" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"initiator" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordings_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE INDEX "recordings_room_started_idx" ON "recordings" USING btree ("room","started_at");
