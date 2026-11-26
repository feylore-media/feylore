CREATE TYPE club_read_status AS ENUM ('scheduled','active','completed','cancelled');
--> statement-breakpoint
CREATE TYPE club_selection_phase AS ENUM ('draft','nominations_open','nominations_closed','voting_open','completed','cancelled');
--> statement-breakpoint
CREATE TYPE club_selection_method AS ENUM ('simple_poll','ranked_choice','random_draw');
--> statement-breakpoint
CREATE TABLE club_selection_rounds (
 id uuid PRIMARY KEY, club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 title text NOT NULL, phase club_selection_phase NOT NULL DEFAULT 'draft', method club_selection_method NOT NULL DEFAULT 'simple_poll',
 nomination_starts_at timestamptz, nomination_ends_at timestamptz, voting_starts_at timestamptz, voting_ends_at timestamptz, next_read_starts_at timestamptz,
 nomination_limit integer NOT NULL DEFAULT 2 CHECK (nomination_limit > 0), configuration jsonb NOT NULL DEFAULT '{}', result jsonb,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, legacy_poll_id uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX club_selection_rounds_club_idx ON club_selection_rounds(club_id,created_at);
--> statement-breakpoint
CREATE TABLE club_selection_candidates (
 id uuid PRIMARY KEY, round_id uuid NOT NULL REFERENCES club_selection_rounds(id) ON DELETE CASCADE,
 work_subject_type text NOT NULL, work_subject_id text, snapshot jsonb NOT NULL, eligible boolean NOT NULL DEFAULT true,
 legacy_option_id uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX club_selection_candidates_round_idx ON club_selection_candidates(round_id);
--> statement-breakpoint
CREATE TABLE club_selection_nominations (
 id uuid PRIMARY KEY, round_id uuid NOT NULL REFERENCES club_selection_rounds(id) ON DELETE CASCADE,
 candidate_id uuid NOT NULL REFERENCES club_selection_candidates(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX club_selection_nomination_unique ON club_selection_nominations(round_id,candidate_id,user_id);
--> statement-breakpoint
CREATE INDEX club_selection_nominations_user_idx ON club_selection_nominations(round_id,user_id);
--> statement-breakpoint
CREATE TABLE club_selection_ballots (
 round_id uuid NOT NULL REFERENCES club_selection_rounds(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, ranking jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(round_id,user_id)
);
--> statement-breakpoint
CREATE TABLE club_reads (
 id uuid PRIMARY KEY, club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 work_subject_type text NOT NULL, work_subject_id text, candidate_snapshot jsonb,
 status club_read_status NOT NULL DEFAULT 'scheduled', start_date timestamptz, target_end_date timestamptz, completed_at timestamptz,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 selection_round_id uuid REFERENCES club_selection_rounds(id) ON DELETE SET NULL,
 legacy_club_work_id uuid REFERENCES club_works(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT club_reads_content_reference CHECK (work_subject_id IS NOT NULL OR candidate_snapshot IS NOT NULL),
 CONSTRAINT club_reads_date_order CHECK (target_end_date IS NULL OR start_date IS NULL OR target_end_date >= start_date)
);
--> statement-breakpoint
CREATE INDEX club_reads_club_date_idx ON club_reads(club_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX club_reads_one_active ON club_reads(club_id) WHERE status='active';
--> statement-breakpoint
CREATE UNIQUE INDEX club_reads_one_scheduled ON club_reads(club_id) WHERE status='scheduled';
--> statement-breakpoint
ALTER TABLE club_schedules ADD COLUMN club_read_id uuid REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX club_schedules_read_idx ON club_schedules(club_read_id);
--> statement-breakpoint
ALTER TABLE club_schedule_occurrences ADD COLUMN club_read_id uuid REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX club_schedule_occurrences_read_idx ON club_schedule_occurrences(club_read_id);
--> statement-breakpoint
ALTER TABLE club_topics ADD COLUMN club_read_id uuid REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX club_topics_read_idx ON club_topics(club_read_id);
--> statement-breakpoint
ALTER TABLE club_topics ADD COLUMN media_location jsonb, ADD COLUMN spoiler_boundary jsonb;
--> statement-breakpoint
ALTER TABLE club_quotes ADD COLUMN club_read_id uuid REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
CREATE INDEX club_quotes_read_idx ON club_quotes(club_read_id);
--> statement-breakpoint
ALTER TABLE club_quotes ADD COLUMN media_location jsonb, ADD COLUMN spoiler_boundary jsonb;
--> statement-breakpoint
INSERT INTO club_selection_rounds(id,club_id,title,phase,method,created_by,legacy_poll_id,created_at,updated_at,result)
 SELECT id,club_id,title,CASE status WHEN 'draft' THEN 'draft' WHEN 'active' THEN 'voting_open' ELSE 'completed' END::club_selection_phase,
 'simple_poll',created_by_user_id,id,created_at,updated_at,
 CASE WHEN status IN ('closed','applied') THEN jsonb_build_object('method','simple_poll','winnerId',winning_option_id,'legacy',true,'closedAt',closed_at,'appliedAt',applied_at) END FROM club_polls;
--> statement-breakpoint
INSERT INTO club_selection_candidates(id,round_id,work_subject_type,work_subject_id,snapshot,eligible,legacy_option_id,created_at)
 SELECT o.id,o.poll_id,o.work_subject_type,o.work_subject_id,
 jsonb_build_object('title',COALESCE(b.title,m.title,t.title,'Unavailable work'),
 'authors',COALESCE((SELECT jsonb_agg(a.name ORDER BY a.sort_order) FROM book_authors a WHERE a.book_id=b.id),'[]'::jsonb),
 'genres','[]'::jsonb,'contentWarnings','[]'::jsonb,'providerIdentifiers','{}'::jsonb,'provenance',jsonb_build_array(jsonb_build_object('source','work','sourceId',o.work_subject_id))),
 o.removed_at IS NULL,o.id,o.created_at FROM club_poll_options o
 LEFT JOIN books b ON o.work_subject_type='book' AND o.work_subject_id=b.id
 LEFT JOIN movies m ON o.work_subject_type='movie' AND o.work_subject_id=m.id
 LEFT JOIN tv_shows t ON o.work_subject_type='show' AND o.work_subject_id=t.id;
--> statement-breakpoint
INSERT INTO club_selection_ballots(round_id,user_id,ranking,created_at,updated_at) SELECT poll_id,user_id,jsonb_build_array(option_id),created_at,created_at FROM club_poll_votes;
--> statement-breakpoint
INSERT INTO club_reads(id,club_id,work_subject_type,work_subject_id,status,created_by,legacy_club_work_id,created_at,updated_at)
 SELECT id,club_id,work_subject_type,work_subject_id,
 CASE WHEN status='current' THEN 'active' WHEN status='completed' THEN 'completed'
 WHEN status='queued' THEN 'scheduled' END::club_read_status,
 added_by_user_id,id,created_at,updated_at
 FROM (SELECT w.*,row_number() OVER (PARTITION BY club_id,status ORDER BY sort_order,created_at,id) queue_position FROM club_works w) source
 WHERE status IN ('current','completed') OR (status='queued' AND queue_position=1);
--> statement-breakpoint
UPDATE club_schedules s SET club_read_id=r.id FROM club_reads r WHERE s.club_work_id=r.legacy_club_work_id AND s.club_id=r.club_id;
--> statement-breakpoint
UPDATE club_schedule_occurrences o SET club_read_id=s.club_read_id FROM club_schedules s WHERE o.schedule_id=s.id AND o.club_id=s.club_id;
--> statement-breakpoint
UPDATE club_topics t SET club_read_id=o.club_read_id FROM club_schedule_occurrences o WHERE t.schedule_occurrence_id=o.id AND t.club_id=o.club_id;
