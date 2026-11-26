import { describe, it, expect } from "vitest";
import { deriveTaskKey } from "../src/server/modules/jobs/task-key.js";
import { JOB_TYPES } from "../src/server/modules/jobs/types.js";
import { computeFailureStreak } from "../src/server/modules/jobs/task-summary.js";

const JOB_ID = "00000000-0000-4000-8000-000000000001";

describe("deriveTaskKey", () => {
  it("uses storageLocationId for library.scan", () => {
    const loc = "11111111-1111-4111-8111-111111111111";
    expect(
      deriveTaskKey(JOB_TYPES.LIBRARY_SCAN, { storageLocationId: loc }, JOB_ID),
    ).toBe(loc);
  });

  it("uses storageLocationId for library.associate when present", () => {
    const loc = "11111111-1111-4111-8111-111111111111";
    expect(
      deriveTaskKey(
        JOB_TYPES.LIBRARY_ASSOCIATE,
        { storageLocationId: loc, fileIds: ["b", "a"] },
        JOB_ID,
      ),
    ).toBe(loc);
  });

  it("hashes sorted fileIds for library.associate without storage location", () => {
    const a = deriveTaskKey(
      JOB_TYPES.LIBRARY_ASSOCIATE,
      { fileIds: ["z-id", "a-id"] },
      JOB_ID,
    );
    const b = deriveTaskKey(
      JOB_TYPES.LIBRARY_ASSOCIATE,
      { fileIds: ["a-id", "z-id"] },
      JOB_ID,
    );
    expect(a).toBe(b);
    expect(a).not.toBe(JOB_ID);
    expect(a).toHaveLength(64);
  });

  it("uses representationId for metadata.ingest", () => {
    const rep = "22222222-2222-4222-8222-222222222222";
    expect(
      deriveTaskKey(JOB_TYPES.METADATA_INGEST, { representationId: rep }, JOB_ID),
    ).toBe(rep);
  });

  it("uses entityType and entityId for search.index when both exist", () => {
    expect(
      deriveTaskKey(
        JOB_TYPES.SEARCH_INDEX,
        { entityType: "book", entityId: "abc123" },
        JOB_ID,
      ),
    ).toBe("book:abc123");
  });

  it("falls back to jobId for search.index without both entity fields", () => {
    expect(
      deriveTaskKey(JOB_TYPES.SEARCH_INDEX, { entityType: "book" }, JOB_ID),
    ).toBe(JOB_ID);
    expect(deriveTaskKey(JOB_TYPES.SEARCH_INDEX, {}, JOB_ID)).toBe(JOB_ID);
  });

  it("falls back to jobId for unknown types", () => {
    expect(deriveTaskKey("unknown.type", {}, JOB_ID)).toBe(JOB_ID);
  });
});

describe("computeFailureStreak", () => {
  const row = (
    status: "failed" | "completed" | "cancelled" | "queued" | "running",
    id: string,
  ) =>
    ({
      id,
      status,
      type: "library.scan",
      taskKey: "loc-1",
      attempts: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      bossJobId: null,
      progress: null,
      error: null,
      logExcerpt: null,
      payload: null,
      completedAt: null,
    }) as const;

  it("returns 0 when latest is running", () => {
    expect(
      computeFailureStreak([
        row("running", "1"),
        row("failed", "2"),
      ] as never),
    ).toBe(0);
  });

  it("counts consecutive failures", () => {
    expect(
      computeFailureStreak([
        row("failed", "1"),
        row("failed", "2"),
        row("failed", "3"),
      ] as never),
    ).toBe(3);
  });

  it("stops at cancelled run", () => {
    expect(
      computeFailureStreak([
        row("failed", "1"),
        row("cancelled", "2"),
        row("failed", "3"),
      ] as never),
    ).toBe(1);
  });

  it("stops at completed run", () => {
    expect(
      computeFailureStreak([
        row("failed", "1"),
        row("completed", "2"),
      ] as never),
    ).toBe(1);
  });
});
