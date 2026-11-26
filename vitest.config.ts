import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

if (process.env.DATABASE_URL) {
  process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
  process.env.FEYLORE_TEST_DATABASE_URL ??= process.env.DATABASE_URL;
}
const testLibraryRoot = path.join(os.tmpdir(), `feylore-tests-${randomUUID()}`);
process.env.STORAGE_ROOT ??= path.join(testLibraryRoot, "storage");
process.env.INGEST_ROOT ??= path.join(testLibraryRoot, "ingest");
process.env.LIBRARY_BOOKS_ROOT ??= path.join(testLibraryRoot, "books");
process.env.LIBRARY_AUDIOBOOKS_ROOT ??= path.join(testLibraryRoot, "audiobooks");
process.env.LIBRARY_MUSIC_ROOT ??= path.join(testLibraryRoot, "music");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
    },
  },
});
