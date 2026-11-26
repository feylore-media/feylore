CREATE TABLE club_topic_read_state (
 topic_id uuid NOT NULL REFERENCES club_topics(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(topic_id,user_id)
);
CREATE INDEX club_topic_read_state_user_idx ON club_topic_read_state(user_id);
ALTER TABLE club_topics ADD COLUMN shared_quote_id uuid REFERENCES club_quotes(id) ON DELETE SET NULL;
