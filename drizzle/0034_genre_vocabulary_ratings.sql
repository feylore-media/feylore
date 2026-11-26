ALTER TABLE "metadata_vocabulary_terms" ADD COLUMN "slug" text;
ALTER TABLE "metadata_vocabulary_terms" ADD COLUMN "media_types" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "metadata_vocabulary_terms" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "metadata_vocabulary_terms" ADD COLUMN "sort_order" bigint;
UPDATE "metadata_vocabulary_terms"
SET "slug" = trim(both '-' from regexp_replace(lower(replace("name", '&', ' and ')), '[^a-z0-9]+', '-', 'g'));
WITH ranked AS (
  SELECT "id", "kind", "slug", row_number() OVER (PARTITION BY "kind", "slug" ORDER BY "created_at", "id") AS n
  FROM "metadata_vocabulary_terms"
)
UPDATE "metadata_vocabulary_terms" AS term
SET "slug" = concat(ranked."slug", '-', left(term."id"::text, 8))
FROM ranked
WHERE term."id" = ranked."id" AND (ranked.n > 1 OR ranked."slug" = '');
ALTER TABLE "metadata_vocabulary_terms" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "metadata_vocabulary_terms_kind_slug_unique" ON "metadata_vocabulary_terms" ("kind", "slug");

ALTER TABLE "book_rating_genre_definitions" DROP CONSTRAINT IF EXISTS "book_rating_genre_definitions_genre_term_id_unique";
ALTER TABLE "book_rating_genre_definitions" ADD COLUMN "media_type" text DEFAULT 'books' NOT NULL;
ALTER TABLE "book_rating_genre_definitions" ADD COLUMN "inheritance_mode" text DEFAULT 'custom' NOT NULL;
ALTER TABLE "book_rating_genre_definitions" DROP CONSTRAINT IF EXISTS "book_rating_genre_definitions_genre_term_id_metadata_vocabulary_terms_id_fk";
ALTER TABLE "book_rating_genre_definitions" ADD CONSTRAINT "book_rating_genre_definitions_genre_term_id_metadata_vocabulary_terms_id_fk" FOREIGN KEY ("genre_term_id") REFERENCES "metadata_vocabulary_terms"("id") ON DELETE restrict;
ALTER TABLE "book_rating_genre_definitions" ADD CONSTRAINT "book_rating_genre_definitions_inheritance_check" CHECK ("inheritance_mode" IN ('inherit', 'custom'));
CREATE UNIQUE INDEX "book_rating_genre_definitions_term_media_unique" ON "book_rating_genre_definitions" ("genre_term_id", "media_type");
