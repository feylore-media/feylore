CREATE TABLE "book_contributors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"name" text NOT NULL,
	"sort_order" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" varchar(6) NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_contributors" ADD CONSTRAINT "book_contributors_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "book_contributors_book_idx" ON "book_contributors" USING btree ("book_id");
--> statement-breakpoint
CREATE INDEX "book_tags_book_idx" ON "book_tags" USING btree ("book_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "book_tag_unique" ON "book_tags" USING btree ("book_id","name");
--> statement-breakpoint
UPDATE "book_series_members" AS m
SET "position" = sub.parsed_position
FROM (
  SELECT
    m2.id,
    (regexp_match(s.name, '\s+#(\d+)\s*$'))[1]::bigint AS parsed_position
  FROM "book_series_members" AS m2
  INNER JOIN "book_series" AS s ON s.id = m2.series_id
  WHERE s.name ~ '\s+#\d+\s*$'
    AND m2.position IS NULL
) AS sub
WHERE m.id = sub.id;
--> statement-breakpoint
UPDATE "book_series" AS s
SET "name" = sub.parsed_name
FROM (
  SELECT
    s2.id,
    regexp_replace(s2.name, '\s+#\d+\s*$', '') AS parsed_name
  FROM "book_series" AS s2
  WHERE s2.name ~ '\s+#\d+\s*$'
) AS sub
WHERE s.id = sub.id;
