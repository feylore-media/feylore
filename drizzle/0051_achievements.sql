CREATE TABLE IF NOT EXISTS "achievement_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"presentation" jsonb,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_label" text,
	"created_by_user_id" uuid,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "achievement_definitions" ADD CONSTRAINT "achievement_definitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "achievement_definition_source_key_unique" ON "achievement_definitions" ("source_type","source_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "achievement_definition_source_idx" ON "achievement_definitions" ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "achievement_definition_state_idx" ON "achievement_definitions" ("state");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_achievements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_definition_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_label" text,
	"reason_type" text,
	"reason_id" text,
	"reason_label" text,
	"snapshot" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_definition_id_achievement_definitions_id_fk" FOREIGN KEY ("achievement_definition_id") REFERENCES "achievement_definitions"("id") ON DELETE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_achievement_definition_unique" ON "user_achievements" ("user_id","achievement_definition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_achievement_user_earned_idx" ON "user_achievements" ("user_id","earned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_achievement_definition_idx" ON "user_achievements" ("achievement_definition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_achievement_source_idx" ON "user_achievements" ("source_type","source_id");
