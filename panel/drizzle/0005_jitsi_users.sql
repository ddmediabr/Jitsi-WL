CREATE TABLE "disabled_users" (
	"username" text PRIMARY KEY NOT NULL,
	"disabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_by" text
);
