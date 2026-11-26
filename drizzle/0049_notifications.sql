CREATE TABLE IF NOT EXISTS "notification_types" (
	"key" text PRIMARY KEY NOT NULL,
	"label_key" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"default_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_preferences" (
	"user_id" uuid NOT NULL,
	"type_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notification_preferences_user_id_type_key_pk" PRIMARY KEY("user_id","type_key")
);--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_type_key_notification_types_key_fk" FOREIGN KEY ("type_key") REFERENCES "notification_types"("key") ON DELETE cascade;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"actor_user_id" uuid,
	"subject_type" text,
	"subject_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"aggregate_key" text,
	"aggregated_count" integer DEFAULT 1 NOT NULL,
	"read_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_notification_types_key_fk" FOREIGN KEY ("type") REFERENCES "notification_types"("key") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_recipient_dedupe_idx" ON "notifications" ("recipient_user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx" ON "notifications" ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" ("recipient_user_id") WHERE "read_at" IS NULL;