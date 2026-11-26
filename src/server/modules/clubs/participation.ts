import { sql } from "drizzle-orm";

/** Read-specific evidence. Membership and read creation do not imply participation. */
export function participantIds(readId: string) {
  return sql`SELECT author_user_id AS user_id FROM club_topics WHERE club_read_id=${readId}
    UNION SELECT p.author_user_id FROM club_posts p JOIN club_topics t ON t.id=p.topic_id WHERE t.club_read_id=${readId}
    UNION SELECT author_user_id FROM club_quotes WHERE club_read_id=${readId}
    UNION SELECT c.user_id FROM club_occurrence_check_ins c JOIN club_schedule_occurrences o ON o.id=c.occurrence_id WHERE o.club_read_id=${readId}`;
}

/** Scope each evidence branch before deduplication for Club-wide history queries. */
export function participantPairsForClub(clubId: string) {
  return sql`SELECT t.club_read_id AS read_id,t.author_user_id AS user_id FROM club_topics t WHERE t.club_id=${clubId}
    UNION SELECT t.club_read_id,p.author_user_id FROM club_posts p JOIN club_topics t ON t.id=p.topic_id WHERE t.club_id=${clubId}
    UNION SELECT q.club_read_id,q.author_user_id FROM club_quotes q WHERE q.club_id=${clubId}
    UNION SELECT o.club_read_id,c.user_id FROM club_occurrence_check_ins c JOIN club_schedule_occurrences o ON o.id=c.occurrence_id WHERE c.club_id=${clubId}`;
}
