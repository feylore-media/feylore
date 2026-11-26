CREATE INDEX IF NOT EXISTS club_selection_candidates_page_idx ON club_selection_candidates(round_id,id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS club_selection_nominations_candidate_created_idx ON club_selection_nominations(candidate_id,created_at,id);
