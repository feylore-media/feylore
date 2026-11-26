ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "alternate_names" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "birth_date" date;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "death_date" date;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "birth_place" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "death_place" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"people_id" varchar(6) NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"url" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_links" ADD CONSTRAINT "person_links_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_links_people_idx" ON "person_links" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_links_kind_idx" ON "person_links" USING btree ("kind");