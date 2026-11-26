DELETE FROM "person_credits" WHERE "target_id" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "person_credit_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "person_credit_unique" ON "person_credits" USING btree ("people_id","target_type","target_id","role");
--> statement-breakpoint
ALTER TABLE "person_credits" ALTER COLUMN "target_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "person_credits" DROP COLUMN IF EXISTS "title";
--> statement-breakpoint
ALTER TABLE "person_credits" DROP COLUMN IF EXISTS "external_url";
--> statement-breakpoint
ALTER TABLE "person_credits" DROP COLUMN IF EXISTS "external_label";
--> statement-breakpoint
ALTER TABLE "person_credits" DROP COLUMN IF EXISTS "release_date";