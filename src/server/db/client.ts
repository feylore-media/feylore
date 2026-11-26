import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export function createPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
