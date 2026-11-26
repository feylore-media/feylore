CREATE TABLE IF NOT EXISTS "user_stat_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"media_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'count' NOT NULL,
	"rating_scale" integer,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_stat_facts" ADD CONSTRAINT "user_stat_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_stat_facts_source_unique" ON "user_stat_facts" ("user_id","kind","source","source_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stat_facts_user_occurred_idx" ON "user_stat_facts" ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stat_facts_user_type_occurred_idx" ON "user_stat_facts" ("user_id","media_type","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stat_facts_user_kind_idx" ON "user_stat_facts" ("user_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_stat_facts_user_visibility_idx" ON "user_stat_facts" ("user_id","visibility");