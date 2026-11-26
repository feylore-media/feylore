-- Migrate shelf icons from legacy emoji to Solar icon IDs.

UPDATE "shelves" SET "icon" = CASE "icon"
  WHEN '📚' THEN 'books'
  WHEN '📖' THEN 'book-open'
  WHEN '🎬' THEN 'movies'
  WHEN '🎧' THEN 'audiobook'
  WHEN '♫' THEN 'music'
  WHEN '📺' THEN 'tv'
  WHEN '🎙' THEN 'podcast'
  WHEN '🖼' THEN 'photos'
  WHEN '🎲' THEN 'ttrpg'
  WHEN '⭐' THEN 'star'
  WHEN '🔖' THEN 'bookmark'
  ELSE "icon"
END;

ALTER TABLE "shelves" ALTER COLUMN "icon" SET DEFAULT 'books';
