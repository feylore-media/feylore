ALTER TABLE "person_credits" ALTER COLUMN "target_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "person_credits" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
ALTER TABLE "person_credits" ADD COLUMN IF NOT EXISTS "external_url" text;
--> statement-breakpoint
ALTER TABLE "person_credits" ADD COLUMN IF NOT EXISTS "external_label" text;
--> statement-breakpoint
ALTER TABLE "person_credits" ADD COLUMN IF NOT EXISTS "release_date" date;
--> statement-breakpoint
DROP INDEX IF EXISTS "person_credit_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "person_credit_unique" ON "person_credits" USING btree ("people_id","target_type","target_id","role") WHERE "target_id" IS NOT NULL;