import { writeFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgresql://feylore:feylore@localhost:5432/feylore_test",
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE TEMP TABLE selection_candidates_fixture (
    round_id uuid NOT NULL,
    id uuid NOT NULL,
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
  )`);
  await client.query(`INSERT INTO selection_candidates_fixture(round_id,id)
    SELECT '00000000-0000-4000-8000-000000000001'::uuid,
      ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid
    FROM generate_series(1,50000) i`);
  const query = `EXPLAIN (ANALYZE, BUFFERS)
    SELECT id FROM selection_candidates_fixture
    WHERE round_id='00000000-0000-4000-8000-000000000001'::uuid
      AND id>'00000000-0000-4000-8000-000000025000'::uuid
    ORDER BY id LIMIT 25`;
  const before = await client.query(query);
  await client.query(
    "CREATE INDEX selection_candidates_fixture_page_idx ON selection_candidates_fixture(round_id,id)",
  );
  await client.query("ANALYZE selection_candidates_fixture");
  const after = await client.query(query);
  const deployed = await client.query(`SELECT indexname,indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND indexname IN (
      'club_selection_candidates_page_idx',
      'club_selection_nominations_candidate_created_idx'
    ) ORDER BY indexname`);
  const render = (rows) => rows.map((row) => row["QUERY PLAN"]).join("\n");
  await writeFile(
    "clubs-selection-index-checkpoint.log",
    [
      "Deployed indexes",
      ...deployed.rows.map((row) => `${row.indexname}: ${row.indexdef}`),
      "",
      "50,000-row fixture before composite index",
      render(before.rows),
      "",
      "50,000-row fixture after composite index",
      render(after.rows),
      "",
    ].join("\n"),
  );
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}
