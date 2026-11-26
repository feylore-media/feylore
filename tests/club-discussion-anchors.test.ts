import { describe, it, expect } from "vitest";
import { prioritizeDiscussionAnchors } from "../src/server/modules/clubs/discussion-anchors.js";
import type { ClubDiscussionAnchor } from "../src/shared/clubs.js";

function anchor(
  id: string,
  overrides: Partial<ClubDiscussionAnchor> = {},
): ClubDiscussionAnchor {
  return {
    id,
    occurrenceId: id,
    consumption: { kind: "chapter", start: Number(id), count: 1 },
    label: `Chapter ${id}`,
    topicId: null,
    messageCount: 0,
    lastActivityAt: null,
    emphasis: null,
    ...overrides,
  };
}

describe("prioritizeDiscussionAnchors", () => {
  it("prioritizes current and last check-in, then recent activity", () => {
    const anchors = [
      anchor("1", { messageCount: 1, lastActivityAt: "2026-01-01T00:00:00.000Z" }),
      anchor("2", { messageCount: 3, lastActivityAt: "2026-02-01T00:00:00.000Z" }),
      anchor("3", {
        messageCount: 5,
        lastActivityAt: "2026-03-01T00:00:00.000Z",
        topicId: "topic-3",
      }),
      anchor("4", { messageCount: 0 }),
      anchor("5", { messageCount: 2, lastActivityAt: "2026-04-01T00:00:00.000Z" }),
    ];

    const result = prioritizeDiscussionAnchors(anchors, "4", "2", 5);

    expect(result.map((row) => row.id)).toEqual(["4", "2", "5", "3", "1"]);
    expect(result[0]?.emphasis).toBe("current");
    expect(result[1]?.emphasis).toBe("last_check_in");
    expect(result[2]?.emphasis).toBe("recent");
  });

  it("does not include empty anchors except current and last check-in", () => {
    const anchors = [
      anchor("1"),
      anchor("2", { messageCount: 1, lastActivityAt: "2026-01-02T00:00:00.000Z" }),
    ];

    const result = prioritizeDiscussionAnchors(anchors, "1", null, 5);

    expect(result.map((row) => row.id)).toEqual(["1", "2"]);
    expect(result[0]?.messageCount).toBe(0);
  });

  it("surfaces revived older chapter when it has newer activity", () => {
    const anchors = [
      anchor("1", { messageCount: 1, lastActivityAt: "2026-05-01T00:00:00.000Z" }),
      anchor("2", { messageCount: 1, lastActivityAt: "2026-01-01T00:00:00.000Z" }),
      anchor("3", { messageCount: 0 }),
    ];

    const result = prioritizeDiscussionAnchors(anchors, "3", "2", 3);

    expect(result.some((row) => row.id === "1" && row.emphasis === "recent")).toBe(
      true,
    );
  });
});
