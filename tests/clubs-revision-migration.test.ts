import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createPool } from "../src/server/db/client.js";
import { generateId } from "../src/server/security/crypto.js";

it("backfills legacy reads, scheduled topics, candidate snapshots and ballots without destroying legacy data", async () => {
  const pool = createPool(
    process.env.TEST_DATABASE_URL ??
      "postgresql://feylore:feylore@localhost:5432/feylore_test",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Everything, including this schema, is rolled back; real application tables are untouched.
    await client.query("CREATE SCHEMA clubs_revision_migration_fixture");
    await client.query(
      "SET LOCAL search_path TO clubs_revision_migration_fixture, public",
    );
    for (const table of [
      "users",
      "clubs",
      "club_works",
      "club_polls",
      "club_poll_options",
      "club_poll_votes",
      "books",
      "book_authors",
      "movies",
      "tv_shows",
      "club_schedules",
      "club_schedule_occurrences",
      "club_topics",
      "club_quotes",
    ]) {
      await client.query(
        `CREATE TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS)`,
      );
      // New tables require FK targets; copy only the primary key shape, not source FKs.
      if (!["club_poll_votes"].includes(table))
        await client.query(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`);
    }
    // Fixture source tables mirror the schema immediately before migration 0036.
    for (const table of [
      "club_schedules",
      "club_schedule_occurrences",
      "club_topics",
      "club_quotes",
    ]) {
      await client.query(
        `ALTER TABLE ${table} DROP COLUMN IF EXISTS club_read_id`,
      );
      if (["club_topics", "club_quotes"].includes(table))
        await client.query(
          `ALTER TABLE ${table} DROP COLUMN IF EXISTS media_location, DROP COLUMN IF EXISTS spoiler_boundary`,
        );
    }
    const user = generateId(),
      club = generateId(),
      current = generateId(),
      queued = generateId(),
      backlog = generateId(),
      completed = generateId();
    const poll = generateId(),
      option = generateId(),
      schedule = generateId(),
      occurrence = generateId(),
      topic = generateId();
    await client.query(
      "INSERT INTO users(id,email,username,display_name,password_hash) VALUES($1,'migration@example.test','migration','Migration','unused')",
      [user],
    );
    await client.query(
      "INSERT INTO clubs(id,name,owner_user_id) VALUES($1,'Migration club',$2)",
      [club, user],
    );
    await client.query(
      "INSERT INTO books(id,slug,slug_status,title) VALUES('mig001','migration-book','canonical','Original title')",
    );
    await client.query(
      "INSERT INTO book_authors(id,book_id,name) VALUES($1,'mig001','Original author')",
      [generateId()],
    );
    for (const [id, status, order] of [
      [current, "current", 0],
      [queued, "queued", 1],
      [backlog, "queued", 2],
      [completed, "completed", 3],
    ]) {
      await client.query(
        "INSERT INTO club_works(id,club_id,work_subject_type,work_subject_id,status,sort_order,added_by_user_id) VALUES($1,$2,'book','mig001',$3,$4,$5)",
        [id, club, status, order, user],
      );
    }
    await client.query(
      "INSERT INTO club_polls(id,club_id,title,status,created_by_user_id,winning_option_id) VALUES($1,$2,'Pick a book','closed',$3,$4)",
      [poll, club, user, option],
    );
    await client.query(
      "INSERT INTO club_poll_options(id,poll_id,work_subject_type,work_subject_id) VALUES($1,$2,'book','mig001')",
      [option, poll],
    );
    await client.query(
      "INSERT INTO club_poll_votes(poll_id,option_id,user_id) VALUES($1,$2,$3)",
      [poll, option, user],
    );
    await client.query(
      "INSERT INTO club_schedules(id,club_id,club_work_id,title,frequency,starts_at,consumption,created_by_user_id) VALUES($1,$2,$3,'Read chapters','once',now(),'{\"kind\":\"chapter\",\"start\":1}',$4)",
      [schedule, club, current, user],
    );
    await client.query(
      'INSERT INTO club_schedule_occurrences(id,schedule_id,club_id,scheduled_at,opens_at,consumption,title) VALUES($1,$2,$3,now(),now(),\'{"kind":"chapter","start":1}\',\'Chapter one\')',
      [occurrence, schedule, club],
    );
    await client.query(
      "INSERT INTO club_topics(id,club_id,author_user_id,kind,title,body,schedule_occurrence_id) VALUES($1,$2,$3,'discussion','A title','A body',$4)",
      [topic, club, user, occurrence],
    );
    const migration = await readFile(
      "drizzle/0036_clubs_read_selection_foundation.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    // Exercise upgrading an already-applied early draft, not only fresh creation.
    await client.query(
      "ALTER TABLE club_reads ADD CONSTRAINT club_reads_legacy_club_work_id_key UNIQUE(legacy_club_work_id)",
    );
    const compatibility = await readFile(
      "drizzle/0037_club_read_compatibility_constraints.sql",
      "utf8",
    );
    for (const statement of compatibility.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    const reads = (
      await client.query("SELECT id,status FROM club_reads ORDER BY status")
    ).rows;
    expect(reads).toHaveLength(3);
    expect(reads).toEqual(
      expect.arrayContaining([
        { id: current, status: "active" },
        { id: queued, status: "scheduled" },
        { id: completed, status: "completed" },
      ]),
    );
    expect(
      (await client.query("SELECT count(*)::int AS count FROM club_works"))
        .rows[0].count,
    ).toBe(4);
    expect(
      (
        await client.query("SELECT club_read_id FROM club_topics WHERE id=$1", [
          topic,
        ])
      ).rows[0].club_read_id,
    ).toBe(current);
    const candidate = (
      await client.query(
        "SELECT snapshot FROM club_selection_candidates WHERE id=$1",
        [option],
      )
    ).rows[0].snapshot;
    expect(candidate.title).toBe("Original title");
    expect(candidate.authors).toEqual(["Original author"]);
    await client.query("UPDATE books SET title='Changed title'");
    expect(
      (
        await client.query(
          "SELECT snapshot FROM club_selection_candidates WHERE id=$1",
          [option],
        )
      ).rows[0].snapshot,
    ).toEqual(candidate);
    expect(
      (
        await client.query(
          "SELECT ranking FROM club_selection_ballots WHERE round_id=$1",
          [poll],
        )
      ).rows[0].ranking,
    ).toEqual([option]);
    expect(
      (await client.query("SELECT count(*)::int AS count FROM club_poll_votes"))
        .rows[0].count,
    ).toBe(1);
    await client.query(
      "INSERT INTO club_reads(id,club_id,work_subject_type,work_subject_id,status,legacy_club_work_id) VALUES($1,$2,'book','mig001','completed',$3)",
      [generateId(), club, completed],
    );
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM club_reads WHERE legacy_club_work_id=$1",
          [completed],
        )
      ).rows[0].count,
    ).toBe(2);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
