-- Shelf model rework: scope, icon, sort levels, membership expression, visibility modes, exclusions

ALTER TABLE "shelves" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'global' NOT NULL;
--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN IF NOT EXISTS "icon" text DEFAULT '📚' NOT NULL;
--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN IF NOT EXISTS "membership_expression" jsonb;
--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN IF NOT EXISTS "sort_levels" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "shelves" SET "scope" = 'global' WHERE "scope" IS NULL OR "scope" = '';
--> statement-breakpoint
-- Legacy rules JSON is not auto-converted; manual shelf_items are preserved. Expression can be reconfigured in the editor.
--> statement-breakpoint
-- Visibility enum: public -> shared, add collaborative
ALTER TYPE "shelf_visibility" RENAME VALUE 'public' TO 'shared';
--> statement-breakpoint
ALTER TYPE "shelf_visibility" ADD VALUE 'collaborative';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shelf_excluded_items" (
  "shelf_id" uuid NOT NULL REFERENCES "shelves"("id") ON DELETE CASCADE,
  "subject_type" text NOT NULL,
  "subject_id" text NOT NULL,
  "excluded_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shelf_excluded_item_unique" ON "shelf_excluded_items" ("shelf_id", "subject_type", "subject_id");
