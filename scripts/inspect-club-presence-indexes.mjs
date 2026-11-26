import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgresql://feylore:feylore@localhost:5432/feylore_test",
});
try {
  const club = (
    await pool.query(
      "SELECT id FROM clubs ORDER BY (SELECT count(*) FROM club_reads WHERE club_id=clubs.id) DESC LIMIT 1",
    )
  ).rows[0];
  if (!club) throw new Error("No Club exists in the test database");
  const member = (
    await pool.query(
      "SELECT user_id FROM club_members WHERE club_id=$1 LIMIT 1",
      [club.id],
    )
  ).rows[0];
  const book = (await pool.query("SELECT book_id FROM book_reviews LIMIT 1"))
    .rows[0];
  const plans = [
    [
      "completed history",
      "SELECT id FROM club_reads WHERE club_id=$1 AND status='completed' ORDER BY COALESCE(completed_at,target_end_date,start_date,'-infinity'::timestamptz) DESC,id DESC LIMIT 20",
      [club.id],
    ],
    [
      "read participation",
      "SELECT t.club_read_id,t.author_user_id FROM club_topics t WHERE t.club_id=$1 UNION SELECT q.club_read_id,q.author_user_id FROM club_quotes q WHERE q.club_id=$1 UNION SELECT o.club_read_id,c.user_id FROM club_occurrence_check_ins c JOIN club_schedule_occurrences o ON o.id=c.occurrence_id WHERE c.club_id=$1",
      [club.id],
    ],
    [
      "member history",
      "SELECT r.id FROM club_reads r JOIN club_topics t ON t.club_read_id=r.id WHERE r.club_id=$1 AND t.author_user_id=$2 AND r.status='completed' ORDER BY COALESCE(r.completed_at,r.target_end_date,r.start_date,'-infinity'::timestamptz) DESC,r.id DESC LIMIT 20",
      [club.id, member?.user_id ?? club.id],
    ],
    [
      "participant ratings",
      "SELECT user_id,final_rating FROM book_reviews WHERE book_id=$1 AND status='completed'",
      [book?.book_id ?? "aaaaaa"],
    ],
    [
      "canonical genres",
      "SELECT name FROM book_genres WHERE book_id=$1",
      [book?.book_id ?? "aaaaaa"],
    ],
  ];
  for (const [label, query, parameters] of plans) {
    console.log(`\n${label}:`);
    const result = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS) ${query}`,
      parameters,
    );
    for (const row of result.rows) console.log(row["QUERY PLAN"]);
  }
} finally {
  await pool.end();
}
