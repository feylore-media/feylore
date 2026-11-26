CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  icon text,
  visibility text NOT NULL DEFAULT 'private',
  metric text NOT NULL,
  aggregation jsonb NOT NULL DEFAULT '{"kind":"count"}'::jsonb,
  target integer NOT NULL,
  activity text NOT NULL DEFAULT 'finish',
  basis text NOT NULL DEFAULT 'completed',
  starts_at timestamptz,
  ends_at timestamptz,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'completed';

CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id);
CREATE INDEX IF NOT EXISTS goals_visibility_idx ON goals (visibility);
