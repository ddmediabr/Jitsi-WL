ALTER TABLE "user" ADD COLUMN "security_tip_seen_at" timestamp with time zone;
--> statement-breakpoint
-- Quem já tinha conta antes desta versão não conta como "primeiro acesso": a tarja não aparece.
UPDATE "user" SET "security_tip_seen_at" = now();
