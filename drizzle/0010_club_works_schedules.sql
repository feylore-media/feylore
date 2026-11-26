CREATE TYPE "club_work_status" AS ENUM('current', 'queued', 'completed', 'associated');--> statement-breakpoint
CREATE TYPE "club_schedule_frequency" AS ENUM('once', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "club_schedule_topic_timing" AS ENUM('at_scheduled_time', 'immediate', 'hours_before');--> statement-breakpoint
CREATE TYPE "club_schedule_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "club_schedule_occurrence_status" AS ENUM('upcoming', 'open', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_works" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"work_subject_type" text NOT NULL,
	"work_subject_id" text NOT NULL,
	"status" "club_work_status" DEFAULT 'associated' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"club_work_id" uuid,
	"title" text NOT NULL,
	"frequency" "club_schedule_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '19:00' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"max_occurrences" integer,
	"consumption" jsonb NOT NULL,
	"topic_title_template" text DEFAULT '{{date}} — {{consumptionLabel}}' NOT NULL,
	"topic_body_template" text DEFAULT 'Discussion for {{consumptionLabel}}.' NOT NULL,
	"topic_timing" "club_schedule_topic_timing" DEFAULT 'at_scheduled_time' NOT NULL,
	"hours_before" integer,
	"auto_create_topic" boolean DEFAULT true NOT NULL,
	"status" "club_schedule_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_schedule_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schedule_id" uuid,
	"club_id" uuid NOT NULL,
	"work_subject_type" text,
	"work_subject_id" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"consumption" jsonb NOT NULL,
	"title" text NOT NULL,
	"topic_id" uuid,
	"status" "club_schedule_occurrence_status" DEFAULT 'upcoming' NOT NULL,
	"sequence_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_topics" ADD COLUMN "work_subject_type" text;--> statement-breakpoint
ALTER TABLE "club_topics" ADD COLUMN "work_subject_id" text;--> statement-breakpoint
ALTER TABLE "club_topics" ADD COLUMN "schedule_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "club_works" ADD CONSTRAINT "club_works_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_works" ADD CONSTRAINT "club_works_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedules_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedules_club_work_id_club_works_id_fk" FOREIGN KEY ("club_work_id") REFERENCES "public"."club_works"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_schedule_occurrences" ADD CONSTRAINT "club_schedule_occurrences_schedule_id_club_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."club_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_schedule_occurrences" ADD CONSTRAINT "club_schedule_occurrences_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_topics" ADD CONSTRAINT "club_topics_schedule_occurrence_id_club_schedule_occurrences_id_fk" FOREIGN KEY ("schedule_occurrence_id") REFERENCES "public"."club_schedule_occurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_work_unique" ON "club_works" USING btree ("club_id","work_subject_type","work_subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_works_club_status_idx" ON "club_works" USING btree ("club_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "club_works_one_current" ON "club_works" USING btree ("club_id") WHERE "club_works"."status" = 'current';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_schedules_club_status_idx" ON "club_schedules" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_schedule_occurrences_club_scheduled_idx" ON "club_schedule_occurrences" USING btree ("club_id","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_schedule_occurrences_schedule_idx" ON "club_schedule_occurrences" USING btree ("schedule_id","sequence_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_schedule_occurrences_opens_idx" ON "club_schedule_occurrences" USING btree ("opens_at","status");
