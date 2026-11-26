ALTER TABLE "club_schedules" ADD COLUMN "event_kind" text NOT NULL DEFAULT 'checkin';
ALTER TABLE "club_schedules" ADD CONSTRAINT "club_schedule_event_kind" CHECK ("event_kind" IN ('checkin','final_discussion'));
