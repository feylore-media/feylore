CREATE TYPE "club_post_body_format" AS ENUM('plain', 'structured');--> statement-breakpoint
ALTER TABLE "club_posts" ADD COLUMN "body_format" "club_post_body_format" DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "club_topics" ADD COLUMN "body_format" "club_post_body_format" DEFAULT 'plain' NOT NULL;
