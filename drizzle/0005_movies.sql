ALTER TYPE "library_content_type" ADD VALUE IF NOT EXISTS 'movies';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movies" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"release_date" text,
	"runtime_seconds" integer,
	"studio" text,
	"content_rating" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "movies_id_format" CHECK ("movies"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "movies_slug_status_check" CHECK ("movies"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"movie_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_people" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movie_people_slug_unique" UNIQUE("slug"),
	CONSTRAINT "movie_people_id_format" CHECK ("movie_people"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "movie_people_slug_status_check" CHECK ("movie_people"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_credits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"movie_id" varchar(6) NOT NULL,
	"person_id" varchar(6) NOT NULL,
	"role" text NOT NULL,
	"character" text,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_collections" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movie_collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "movie_collections_id_format" CHECK ("movie_collections"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "movie_collections_slug_status_check" CHECK ("movie_collections"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_collection_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"collection_id" varchar(6) NOT NULL,
	"movie_id" varchar(6) NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_credits" ADD CONSTRAINT "movie_credits_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_credits" ADD CONSTRAINT "movie_credits_person_id_movie_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."movie_people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_collections" ADD CONSTRAINT "movie_collections_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_collection_items" ADD CONSTRAINT "movie_collection_items_collection_id_movie_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."movie_collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "movie_collection_items" ADD CONSTRAINT "movie_collection_items_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "movie_genre_unique" ON "movie_genres" USING btree ("movie_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_genres_movie_idx" ON "movie_genres" USING btree ("movie_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "movie_credit_unique" ON "movie_credits" USING btree ("movie_id","person_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_credits_movie_idx" ON "movie_credits" USING btree ("movie_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_credits_person_idx" ON "movie_credits" USING btree ("person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "movie_collection_item_unique" ON "movie_collection_items" USING btree ("collection_id","movie_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_collection_items_collection_idx" ON "movie_collection_items" USING btree ("collection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_collection_items_movie_idx" ON "movie_collection_items" USING btree ("movie_id");
