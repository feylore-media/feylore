DROP INDEX IF EXISTS "book_rating_dimension_key_unique";
CREATE UNIQUE INDEX "book_rating_core_dimension_key_unique"
  ON "book_rating_dimensions" ("key")
  WHERE "scope" = 'core';
CREATE UNIQUE INDEX "book_rating_genre_dimension_key_unique"
  ON "book_rating_dimensions" ("genre_definition_id", "key")
  WHERE "scope" = 'genre';
