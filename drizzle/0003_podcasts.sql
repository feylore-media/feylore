CREATE TABLE IF NOT EXISTS "podcast_shows" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"author" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "podcast_shows_slug_unique" UNIQUE("slug"),
	CONSTRAINT "podcast_shows_id_format" CHECK ("podcast_shows"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "podcast_shows_slug_status_check" CHECK ("podcast_shows"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_feeds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"feed_url" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"sync_in_progress" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "podcast_feeds_feed_url_unique" UNIQUE("feed_url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_episodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"guid" text NOT NULL,
	"published_at" timestamp with time zone,
	"duration_seconds" integer,
	"episode_number" integer,
	"season_number" integer,
	"enclosure_url" text,
	"enclosure_mime" text,
	"enclosure_bytes" bigint,
	"representation_id" uuid,
	"prepare_status" text DEFAULT 'none' NOT NULL,
	"prepare_error" text,
	"unavailable_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "podcast_episodes_prepare_status_check" CHECK ("podcast_episodes"."prepare_status" IN ('none', 'pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "podcast_subscriptions" (
	"user_id" uuid NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "podcast_subscriptions_pkey" PRIMARY KEY("user_id","show_id")
);
--> statement-breakpoint
ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "podcast_feeds" ADD CONSTRAINT "podcast_feeds_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "podcast_subscriptions" ADD CONSTRAINT "podcast_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "podcast_subscriptions" ADD CONSTRAINT "podcast_subscriptions_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "podcast_feeds_show_idx" ON "podcast_feeds" USING btree ("show_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "podcast_episodes_show_guid_unique" ON "podcast_episodes" USING btree ("show_id","guid");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "podcast_episodes_show_slug_unique" ON "podcast_episodes" USING btree ("show_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "podcast_episodes_show_idx" ON "podcast_episodes" USING btree ("show_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "podcast_episodes_published_idx" ON "podcast_episodes" USING btree ("show_id","published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "podcast_subscriptions_show_idx" ON "podcast_subscriptions" USING btree ("show_id");
