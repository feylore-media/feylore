ALTER TABLE "clubs" ADD COLUMN "selection_defaults" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "clubs" ADD COLUMN "read_defaults" jsonb NOT NULL DEFAULT '{}'::jsonb;
