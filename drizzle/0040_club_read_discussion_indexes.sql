CREATE INDEX club_topics_read_activity_idx ON club_topics (club_read_id,last_activity_at DESC,id DESC);
CREATE INDEX club_quotes_read_created_idx ON club_quotes (club_read_id,created_at DESC,id DESC);
