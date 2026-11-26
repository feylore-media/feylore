ALTER TYPE "library_content_type" ADD VALUE IF NOT EXISTS 'music';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "albums" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"release_date" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_slug_unique" UNIQUE("slug"),
	CONSTRAINT "albums_id_format" CHECK ("albums"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "albums_slug_status_check" CHECK ("albums"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "music_artists" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "music_artists_slug_unique" UNIQUE("slug"),
	CONSTRAINT "music_artists_id_format" CHECK ("music_artists"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "music_artists_slug_status_check" CHECK ("music_artists"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_artists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" varchar(6) NOT NULL,
	"artist_id" varchar(6) NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "music_tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" varchar(6) NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"disc_number" integer,
	"track_number" integer,
	"duration_seconds" integer,
	"representation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_artists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"track_id" uuid NOT NULL,
	"artist_id" varchar(6) NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "music_playlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "music_playlist_tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"playlist_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "album_artists" ADD CONSTRAINT "album_artists_artist_id_music_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."music_artists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "album_genres" ADD CONSTRAINT "album_genres_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_representation_id_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."representations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_track_id_music_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."music_tracks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artist_id_music_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."music_artists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_playlists" ADD CONSTRAINT "music_playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_playlist_tracks" ADD CONSTRAINT "music_playlist_tracks_playlist_id_music_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."music_playlists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_playlist_tracks" ADD CONSTRAINT "music_playlist_tracks_track_id_music_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."music_tracks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "album_artist_unique" ON "album_artists" USING btree ("album_id","artist_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_artists_album_idx" ON "album_artists" USING btree ("album_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_artists_artist_idx" ON "album_artists" USING btree ("artist_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "album_genre_unique" ON "album_genres" USING btree ("album_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "album_genres_album_idx" ON "album_genres" USING btree ("album_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "music_tracks_album_slug_unique" ON "music_tracks" USING btree ("album_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_tracks_album_idx" ON "music_tracks" USING btree ("album_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_tracks_album_order_idx" ON "music_tracks" USING btree ("album_id","disc_number","track_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "track_artist_unique" ON "track_artists" USING btree ("track_id","artist_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_artists_track_idx" ON "track_artists" USING btree ("track_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "music_playlists_user_slug_unique" ON "music_playlists" USING btree ("user_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_playlists_user_idx" ON "music_playlists" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "music_playlist_track_unique" ON "music_playlist_tracks" USING btree ("playlist_id","track_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_playlist_tracks_playlist_idx" ON "music_playlist_tracks" USING btree ("playlist_id");
