CREATE TABLE "brand_assets" (
	"kind" text PRIMARY KEY NOT NULL,
	"data" bytea NOT NULL,
	"mime" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
