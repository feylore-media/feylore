ALTER TABLE "job_runs" ADD COLUMN "task_key" text;
--> statement-breakpoint
UPDATE "job_runs" SET "task_key" = COALESCE(
  NULLIF("payload"->>'storageLocationId', ''),
  NULLIF("payload"->>'representationId', ''),
  NULLIF("payload"->>'fileId', ''),
  NULLIF("payload"->>'downloadId', ''),
  NULLIF("payload"->>'feedId', ''),
  NULLIF("payload"->>'episodeId', ''),
  "id"::text
);
--> statement-breakpoint
UPDATE "job_runs" SET "attempts" = 1 WHERE "attempts" = 0;
--> statement-breakpoint
ALTER TABLE "job_runs" ALTER COLUMN "task_key" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_runs_type_task_key_created_idx" ON "job_runs" USING btree ("type","task_key","created_at" DESC);
