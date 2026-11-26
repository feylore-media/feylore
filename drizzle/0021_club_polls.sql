CREATE TYPE "club_poll_status" AS ENUM('draft', 'active', 'closed', 'applied');--> statement-breakpoint
CREATE TYPE "club_poll_discovery_source" AS ENUM('tbr', 'club_queued', 'manual', 'library');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_polls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "club_poll_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"winning_option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_poll_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"poll_id" uuid NOT NULL,
	"work_subject_type" text NOT NULL,
	"work_subject_id" text NOT NULL,
	"discovery_source" "club_poll_discovery_source" DEFAULT 'manual' NOT NULL,
	"tbr_member_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_poll_votes" (
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_poll_votes_poll_id_user_id_pk" PRIMARY KEY("poll_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "club_polls" ADD CONSTRAINT "club_polls_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_polls" ADD CONSTRAINT "club_polls_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_options" ADD CONSTRAINT "club_poll_options_poll_id_club_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."club_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_poll_id_club_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."club_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_option_id_club_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."club_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_poll_votes" ADD CONSTRAINT "club_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_polls_club_status_idx" ON "club_polls" USING btree ("club_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_poll_options_poll_idx" ON "club_poll_options" USING btree ("poll_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_poll_votes_option_idx" ON "club_poll_votes" USING btree ("option_id");
