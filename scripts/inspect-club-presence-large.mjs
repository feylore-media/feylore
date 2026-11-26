import { randomUUID } from "node:crypto";
import pg from "pg";

// Disposable 20,000-read / 20,000-topic fixture. All inserted data rolls back.
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://feylore:feylore@localhost:5432/feylore_test" });
const client = await pool.connect();
try {
  const owner = (await client.query("SELECT id FROM users LIMIT 1")).rows[0];
  if (!owner) throw new Error("Seed the test database before inspecting plans");
  const clubId = randomUUID();
  await client.query("BEGIN");
  await client.query("INSERT INTO clubs(id,owner_user_id,name,visibility,context) VALUES($1,$2,'Plan fixture','private','book')", [clubId, owner.id]);
  await client.query(`WITH inserted AS (
    INSERT INTO club_reads(id,club_id,work_subject_type,candidate_snapshot,status,start_date,completed_at)
    SELECT gen_random_uuid(),$1,'book','{"title":"Fixture","authors":["Writer"],"genres":[],"contentWarnings":[],"providerIdentifiers":{},"provenance":[]}'::jsonb,'completed',
      now()-(g.n+30)*interval '1 day',now()-g.n*interval '1 day'
    FROM generate_series(1,20000) AS g(n) RETURNING id,club_id
  ) INSERT INTO club_topics(id,club_read_id,club_id,author_user_id,kind,title,body)
    SELECT gen_random_uuid(),id,club_id,$2,'discussion','Fixture topic','Fixture body' FROM inserted`, [clubId, owner.id]);
  await client.query("ANALYZE club_reads");
  await client.query("ANALYZE club_topics");
  const plans = [
    ["20,000 completed-read page", "SELECT id FROM club_reads WHERE club_id=$1 AND status='completed' ORDER BY COALESCE(completed_at,target_end_date,start_date,'-infinity'::timestamptz) DESC,id DESC LIMIT 20", [clubId]],
    ["20,000 read-topic participant pairs", "SELECT t.club_read_id,t.author_user_id FROM club_topics t WHERE t.club_id=$1 UNION SELECT q.club_read_id,q.author_user_id FROM club_quotes q WHERE q.club_id=$1 UNION SELECT o.club_read_id,c.user_id FROM club_occurrence_check_ins c JOIN club_schedule_occurrences o ON o.id=c.occurrence_id WHERE c.club_id=$1", [clubId]],
    ["20,000-read member history page", "SELECT r.id FROM club_reads r JOIN club_topics t ON t.club_read_id=r.id WHERE r.club_id=$1 AND t.author_user_id=$2 AND r.status='completed' ORDER BY COALESCE(r.completed_at,r.target_end_date,r.start_date,'-infinity'::timestamptz) DESC,r.id DESC LIMIT 20", [clubId, owner.id]],
  ];
  for (const [label, query, parameters] of plans) {
    console.log(`\n${label}:`);
    const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`, parameters);
    for (const row of result.rows) console.log(row["QUERY PLAN"]);
  }
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
}
