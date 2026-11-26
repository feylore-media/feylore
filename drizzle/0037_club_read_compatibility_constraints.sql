-- Preserve history across rereads through one legacy Work association.
-- NO ACTION permits whole-club cascades while preventing orphaned read-specific records.
ALTER TABLE club_reads DROP CONSTRAINT IF EXISTS club_reads_legacy_club_work_id_key;
--> statement-breakpoint
ALTER TABLE club_schedules DROP CONSTRAINT IF EXISTS club_schedules_club_read_id_fkey;
--> statement-breakpoint
ALTER TABLE club_schedules ADD CONSTRAINT club_schedules_club_read_id_fkey FOREIGN KEY(club_read_id) REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE club_schedule_occurrences DROP CONSTRAINT IF EXISTS club_schedule_occurrences_club_read_id_fkey;
--> statement-breakpoint
ALTER TABLE club_schedule_occurrences ADD CONSTRAINT club_schedule_occurrences_club_read_id_fkey FOREIGN KEY(club_read_id) REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE club_topics DROP CONSTRAINT IF EXISTS club_topics_club_read_id_fkey;
--> statement-breakpoint
ALTER TABLE club_topics ADD CONSTRAINT club_topics_club_read_id_fkey FOREIGN KEY(club_read_id) REFERENCES club_reads(id) ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE club_quotes DROP CONSTRAINT IF EXISTS club_quotes_club_read_id_fkey;
--> statement-breakpoint
ALTER TABLE club_quotes ADD CONSTRAINT club_quotes_club_read_id_fkey FOREIGN KEY(club_read_id) REFERENCES club_reads(id) ON DELETE NO ACTION;
