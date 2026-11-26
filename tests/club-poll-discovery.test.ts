import { describe, it, expect } from "vitest";
import {
  pickPollWinner,
  rankPollDiscoveryCandidates,
  scoreClubQueuedCandidate,
  scoreLibraryCandidate,
  scoreTbrCandidate,
} from "../src/shared/club-poll-discovery.js";

describe("rankPollDiscoveryCandidates", () => {
  it("prefers TBR intersection over club queued and library weak matches", () => {
    const ranked = rankPollDiscoveryCandidates([
      {
        workSubjectType: "book",
        workSubjectId: "lib-1",
        source: "library",
        score: scoreLibraryCandidate(3),
      },
      {
        workSubjectType: "book",
        workSubjectId: "club-1",
        source: "club_queued",
        score: scoreClubQueuedCandidate(),
      },
      {
        workSubjectType: "book",
        workSubjectId: "tbr-1",
        source: "tbr",
        tbrMemberCount: 2,
        score: scoreTbrCandidate(2),
      },
    ]);

    expect(ranked.map((row) => row.workSubjectId)).toEqual([
      "tbr-1",
      "club-1",
      "lib-1",
    ]);
  });

  it("deduplicates works and keeps the highest score", () => {
    const ranked = rankPollDiscoveryCandidates([
      {
        workSubjectType: "book",
        workSubjectId: "same",
        source: "library",
        score: scoreLibraryCandidate(1),
      },
      {
        workSubjectType: "book",
        workSubjectId: "same",
        source: "tbr",
        tbrMemberCount: 3,
        score: scoreTbrCandidate(3),
      },
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.source).toBe("tbr");
  });
});

describe("pickPollWinner", () => {
  it("breaks ties by lower sort order", () => {
    const winner = pickPollWinner([
      { id: "a", voteCount: 2, sortOrder: 2 },
      { id: "b", voteCount: 2, sortOrder: 1 },
    ]);
    expect(winner?.id).toBe("b");
  });
});
