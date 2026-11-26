CREATE TYPE "club_topic_kind" AS ENUM('discussion', 'announcement');--> statement-breakpoint
CREATE TYPE "club_post_reaction" AS ENUM('like');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" "club_topic_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" "club_post_reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_content_mentions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid,
	"post_id" uuid,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_topics" ADD CONSTRAINT "club_topics_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_topics" ADD CONSTRAINT "club_topics_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_posts" ADD CONSTRAINT "club_posts_topic_id_club_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."club_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_posts" ADD CONSTRAINT "club_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_posts" ADD CONSTRAINT "club_posts_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_post_reactions" ADD CONSTRAINT "club_post_reactions_post_id_club_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."club_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_post_reactions" ADD CONSTRAINT "club_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_content_mentions" ADD CONSTRAINT "club_content_mentions_topic_id_club_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."club_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_content_mentions" ADD CONSTRAINT "club_content_mentions_post_id_club_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."club_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_content_mentions" ADD CONSTRAINT "club_content_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_topics_club_activity_idx" ON "club_topics" USING btree ("club_id","pinned" DESC,"last_activity_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_posts_topic_created_idx" ON "club_posts" USING btree ("topic_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_post_reactions_post_idx" ON "club_post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_content_mentions_topic_idx" ON "club_content_mentions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_content_mentions_post_idx" ON "club_content_mentions" USING btree ("post_id");
