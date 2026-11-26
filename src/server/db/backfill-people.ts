import { createPool, createDb } from "./client.js";
import { loadConfig } from "../config.js";
import { PeopleService } from "../modules/people/service.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  const people = new PeopleService(db);

  const books = await people.backfillBookAuthors();
  console.log(`[people backfill] book authors: ${books.processed}`);

  const audiobooks = await people.backfillAudiobookCredits();
  console.log(`[people backfill] audiobook credits: ${audiobooks.processed}`);

  const music = await people.backfillMusicCredits();
  console.log(`[people backfill] music credits: ${music.processed}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});