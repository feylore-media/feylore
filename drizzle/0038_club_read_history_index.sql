CREATE INDEX IF NOT EXISTS club_reads_completed_history_idx ON club_reads (club_id, COALESCE(completed_at,target_end_date,start_date,'-infinity'::timestamptz) DESC, id DESC) WHERE status='completed';
