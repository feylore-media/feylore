CREATE TABLE IF NOT EXISTS "challenge_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"invitee_user_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "challenge_invites_state" CHECK ("challenge_invites"."state" IN ('pending', 'accepted', 'declined')),
	CONSTRAINT "challenge_invites_no_self" CHECK ("challenge_invites"."inviter_user_id" <> "challenge_invites"."invitee_user_id")
);--> statement-breakpoint
ALTER TABLE "challenge_invites" ADD CONSTRAINT "challenge_invites_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "challenge_invites" ADD CONSTRAINT "challenge_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "challenge_invites" ADD CONSTRAINT "challenge_invites_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_invites_challenge_invitee_unique" ON "challenge_invites" ("challenge_id","invitee_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_invites_invitee_idx" ON "challenge_invites" ("invitee_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenge_invites_challenge_idx" ON "challenge_invites" ("challenge_id");
