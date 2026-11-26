CREATE TABLE IF NOT EXISTS "club_occurrence_check_ins" (
  "id" uuid PRIMARY KEY NOT NULL,
  "club_id" uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "occurrence_id" uuid NOT NULL REFERENCES "club_schedule_occurrences"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "club_occurrence_check_ins_occurrence_user_unique" UNIQUE("occurrence_id","user_id")
);

CREATE INDEX IF NOT EXISTS "club_occurrence_check_ins_club_idx" ON "club_occurrence_check_ins" ("club_id");
CREATE INDEX IF NOT EXISTS "club_occurrence_check_ins_occurrence_idx" ON "club_occurrence_check_ins" ("occurrence_id");
