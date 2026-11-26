ALTER TABLE "book_authors" ADD COLUMN IF NOT EXISTS "people_id" varchar(6);
--> statement-breakpoint
ALTER TABLE "audiobook_authors" ADD COLUMN IF NOT EXISTS "people_id" varchar(6);
--> statement-breakpoint
ALTER TABLE "audiobook_narrators" ADD COLUMN IF NOT EXISTS "people_id" varchar(6);
--> statement-breakpoint
ALTER TABLE "music_artists" ADD COLUMN IF NOT EXISTS "people_id" varchar(6);
--> statement-breakpoint
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audiobook_authors" ADD CONSTRAINT "audiobook_authors_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audiobook_narrators" ADD CONSTRAINT "audiobook_narrators_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_artists" ADD CONSTRAINT "music_artists_people_id_people_id_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_authors_people_idx" ON "book_authors" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_authors_people_idx" ON "audiobook_authors" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audiobook_narrators_people_idx" ON "audiobook_narrators" USING btree ("people_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "music_artists_people_idx" ON "music_artists" USING btree ("people_id");