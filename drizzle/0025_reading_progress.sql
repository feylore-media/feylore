CREATE TABLE IF NOT EXISTS "reading_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"active_duration" integer DEFAULT 0 NOT NULL,
	"starting_locator_json" jsonb,
	"ending_locator_json" jsonb,
	"device_id" uuid,
	"client_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"qualified_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"work_type" text NOT NULL,
	"work_id" text NOT NULL,
	"locator_json" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_updated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completion_source" text,
	"version" integer DEFAULT 1 NOT NULL,
	"last_device_id" uuid,
	"last_client_id" text,
	"last_idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_progress_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"previous_locator_json" jsonb,
	"locator_json" jsonb NOT NULL,
	"client_updated_at" timestamp with time zone,
	"device_id" uuid,
	"client_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"representation_id" uuid NOT NULL,
	"session_id" uuid,
	"locator_json" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"device_id" uuid,
	"client_id" text,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "representation_sync_identifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"representation_id" uuid NOT NULL,
	"scheme" text NOT NULL,
	"identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_last_device_id_devices_id_fk" FOREIGN KEY ("last_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress_events" ADD CONSTRAINT "reading_progress_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_activity" ADD CONSTRAINT "reading_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_activity" ADD CONSTRAINT "reading_activity_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_activity" ADD CONSTRAINT "reading_activity_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_activity" ADD CONSTRAINT "reading_activity_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "representation_sync_identifiers" ADD CONSTRAINT "representation_sync_identifiers_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_progress_user_rep_unique" ON "reading_progress" USING btree ("user_id","representation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_user_work_idx" ON "reading_progress" USING btree ("user_id","work_type","work_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_rep_idx" ON "reading_progress" USING btree ("representation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_user_updated_idx" ON "reading_progress" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_events_user_rep_occurred_idx" ON "reading_progress_events" USING btree ("user_id","representation_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_sessions_user_started_idx" ON "reading_sessions" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_sessions_user_rep_started_idx" ON "reading_sessions" USING btree ("user_id","representation_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_sessions_rep_started_idx" ON "reading_sessions" USING btree ("representation_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_activity_user_started_idx" ON "reading_activity" USING btree ("user_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_activity_user_rep_started_idx" ON "reading_activity" USING btree ("user_id","representation_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_activity_rep_started_idx" ON "reading_activity" USING btree ("representation_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_activity_session_idx" ON "reading_activity" USING btree ("session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_activity_user_idempotency_unique" ON "reading_activity" USING btree ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "representation_sync_identifiers_scheme_id_unique" ON "representation_sync_identifiers" USING btree ("scheme","identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "representation_sync_identifiers_rep_idx" ON "representation_sync_identifiers" USING btree ("representation_id");
--> statement-breakpoint
INSERT INTO "reading_progress" (
  "id", "user_id", "representation_id", "work_type", "work_id",
  "locator_json", "started_at", "updated_at", "client_updated_at",
  "version", "last_device_id", "last_client_id"
)
SELECT
  gen_random_uuid(),
  up."user_id",
  COALESCE(
    up."representation_id",
    (
      SELECT r."id"
      FROM "representations" r
      INNER JOIN "creative_work_manifestations" m ON m."id" = r."manifestation_id"
      INNER JOIN "creative_work_expressions" e ON e."id" = m."expression_id"
      WHERE e."work_type" = up."subject_type"
        AND e."work_id" = up."subject_id"
        AND r."format" = 'epub'
        AND r."unavailable_at" IS NULL
      LIMIT 1
    )
  ),
  up."subject_type",
  up."subject_id",
  up."locator_json",
  up."updated_at",
  up."updated_at",
  up."updated_at",
  1,
  NULL,
  NULL
FROM "user_progress" up
WHERE (
  (up."locator_json"->>'kind' = 'reading')
  OR NOT (up."locator_json" ? 'kind')
)
AND COALESCE(
  up."representation_id",
  (
    SELECT r."id"
    FROM "representations" r
    INNER JOIN "creative_work_manifestations" m ON m."id" = r."manifestation_id"
    INNER JOIN "creative_work_expressions" e ON e."id" = m."expression_id"
    WHERE e."work_type" = up."subject_type"
      AND e."work_id" = up."subject_id"
      AND r."format" = 'epub'
      AND r."unavailable_at" IS NULL
    LIMIT 1
  )
) IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "user_progress"
WHERE ("locator_json"->>'kind' = 'reading')
   OR (NOT ("locator_json" ? 'kind') AND "subject_type" = 'book');
