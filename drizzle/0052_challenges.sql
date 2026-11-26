CREATE TYPE "public"."challenge_format" AS ENUM('simple', 'bingo', 'quest');--> statement-breakpoint
CREATE TYPE "public"."challenge_visibility" AS ENUM('public', 'private', 'club');--> statement-breakpoint
CREATE TYPE "public"."challenge_join_policy" AS ENUM('open', 'invite_only', 'club_members');--> statement-breakpoint
CREATE TYPE "public"."challenge_state" AS ENUM('draft', 'upcoming', 'active', 'completed', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."challenge_participant_state" AS ENUM('joined', 'left', 'completed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"format" "challenge_format" DEFAULT 'simple' NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"club_id" uuid,
	"visibility" "challenge_visibility" DEFAULT 'public' NOT NULL,
	"join_policy" "challenge_join_policy" DEFAULT 'open' NOT NULL,
	"state" "challenge_state" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_date_order" CHECK ("challenges"."ends_at" > "challenges"."starts_at")
);--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenges_creator_idx" ON "challenges" ("creator_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenges_club_idx" ON "challenges" ("club_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenges_state_idx" ON "challenges" ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenges_visibility_idx" ON "challenges" ("visibility");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"aggregation" jsonb DEFAULT '{"kind":"count"}'::jsonb NOT NULL,
	"target" integer NOT NULL,
	"activity" text DEFAULT 'finish' NOT NULL,
	"basis" text DEFAULT 'completed' NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_objectives_target" CHECK ("challenge_objectives"."target" > 0)
);--> statement-breakpoint
ALTER TABLE "challenge_objectives" ADD CONSTRAINT "challenge_objectives_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_objectives_challenge_idx" ON "challenge_objectives" ("challenge_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenge_participants" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "challenge_participant_state" DEFAULT 'joined' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "challenge_participants_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_participants_user_idx" ON "challenge_participants" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_participants_challenge_state_idx" ON "challenge_participants" ("challenge_id","state");
