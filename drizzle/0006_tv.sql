ALTER TYPE "library_content_type" ADD VALUE IF NOT EXISTS 'tv';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_shows" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"premiere_date" text,
	"studio" text,
	"content_rating" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tv_shows_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tv_shows_id_format" CHECK ("tv_shows"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "tv_shows_slug_status_check" CHECK ("tv_shows"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_seasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"season_number" integer NOT NULL,
	"title" text,
	"description" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_episodes" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"season_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"air_date" text,
	"runtime_seconds" integer,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tv_episodes_id_format" CHECK ("tv_episodes"."id" ~ '^[a-z0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_people" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tv_people_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tv_people_id_format" CHECK ("tv_people"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "tv_people_slug_status_check" CHECK ("tv_people"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tv_credits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"show_id" varchar(6) NOT NULL,
	"person_id" varchar(6) NOT NULL,
	"role" text NOT NULL,
	"character" text,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_tv_playlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text,
	"epg_url" text,
	"source_config" jsonb,
	"credentials_encrypted" text,
	"sync_in_progress" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_tv_playlists_source_kind_check" CHECK ("live_tv_playlists"."source_kind" IN ('m3u', 'manual'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_tv_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"playlist_id" uuid NOT NULL,
	"name" text NOT NULL,
	"group_title" text,
	"logo_url" text,
	"stream_url" text NOT NULL,
	"tvg_id" text,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "live_tv_programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tv_shows" ADD CONSTRAINT "tv_shows_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_seasons" ADD CONSTRAINT "tv_seasons_show_id_tv_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."tv_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_seasons" ADD CONSTRAINT "tv_seasons_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_episodes" ADD CONSTRAINT "tv_episodes_show_id_tv_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."tv_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_episodes" ADD CONSTRAINT "tv_episodes_season_id_tv_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."tv_seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_episodes" ADD CONSTRAINT "tv_episodes_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_genres" ADD CONSTRAINT "tv_genres_show_id_tv_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."tv_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_credits" ADD CONSTRAINT "tv_credits_show_id_tv_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."tv_shows"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tv_credits" ADD CONSTRAINT "tv_credits_person_id_tv_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."tv_people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_tv_channels" ADD CONSTRAINT "live_tv_channels_playlist_id_live_tv_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."live_tv_playlists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "live_tv_programs" ADD CONSTRAINT "live_tv_programs_channel_id_live_tv_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."live_tv_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tv_season_unique" ON "tv_seasons" USING btree ("show_id","season_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_seasons_show_idx" ON "tv_seasons" USING btree ("show_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tv_episode_order_unique" ON "tv_episodes" USING btree ("season_id","episode_number","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_episodes_show_idx" ON "tv_episodes" USING btree ("show_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_episodes_season_idx" ON "tv_episodes" USING btree ("season_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_episodes_season_order_idx" ON "tv_episodes" USING btree ("season_id","episode_number","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tv_genre_unique" ON "tv_genres" USING btree ("show_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_genres_show_idx" ON "tv_genres" USING btree ("show_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tv_credit_unique" ON "tv_credits" USING btree ("show_id","person_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_credits_show_idx" ON "tv_credits" USING btree ("show_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_credits_person_idx" ON "tv_credits" USING btree ("person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "live_tv_channels_playlist_idx" ON "live_tv_channels" USING btree ("playlist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "live_tv_channels_playlist_sort_idx" ON "live_tv_channels" USING btree ("playlist_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "live_tv_programs_channel_idx" ON "live_tv_programs" USING btree ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "live_tv_programs_channel_starts_idx" ON "live_tv_programs" USING btree ("channel_id","starts_at");
