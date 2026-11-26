ALTER TABLE "users" ADD COLUMN "bio" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_file_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_visibility" text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username_changed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "state_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
