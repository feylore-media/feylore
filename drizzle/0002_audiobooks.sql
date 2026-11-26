ALTER TYPE "library_content_type" ADD VALUE IF NOT EXISTS 'audiobook';--> statement-breakpoint
ALTER TABLE "representation_files" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "representation_files_sort_idx" ON "representation_files" USING btree ("representation_id","sort_order");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobooks" (
	"id" varchar(6) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"slug_status" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"cover_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audiobooks_slug_unique" UNIQUE("slug"),
	CONSTRAINT "audiobooks_id_format" CHECK ("audiobooks"."id" ~ '^[a-z0-9]{6}$'),
	CONSTRAINT "audiobooks_slug_status_check" CHECK ("audiobooks"."slug_status" IN ('pending', 'canonical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobook_authors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audiobook_id" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobook_narrators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audiobook_id" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobook_series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobook_series_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"series_id" uuid NOT NULL,
	"audiobook_id" varchar(6) NOT NULL,
	"position" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audiobook_genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"audiobook_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audiobooks" ADD CONSTRAINT "audiobooks_cover_file_id_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_authors" ADD CONSTRAINT "audiobook_authors_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_narrators" ADD CONSTRAINT "audiobook_narrators_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series_members" ADD CONSTRAINT "audiobook_series_members_series_id_audiobook_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."audiobook_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series_members" ADD CONSTRAINT "audiobook_series_members_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_genres" ADD CONSTRAINT "audiobook_genres_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_authors_audiobook_idx" ON "audiobook_authors" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_narrators_audiobook_idx" ON "audiobook_narrators" USING btree ("audiobook_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audiobook_series_member_unique" ON "audiobook_series_members" USING btree ("series_id","audiobook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_series_members_audiobook_idx" ON "audiobook_series_members" USING btree ("audiobook_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audiobook_genre_unique" ON "audiobook_genres" USING btree ("audiobook_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_genres_audiobook_idx" ON "audiobook_genres" USING btree ("audiobook_id");
