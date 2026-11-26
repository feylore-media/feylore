ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_disabled_by_user_id_users_id_fk" FOREIGN KEY ("disabled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
