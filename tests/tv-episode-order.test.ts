import { describe, it, expect } from "vitest";
import {
  compareEpisodes,
  getNextEpisode,
  resolveContinueEpisode,
  listEpisodesForQueue,
} from "../src/server/modules/tv/episode-order.js";

const episodes = [
  { id: "ep0001", seasonNumber: 1, episodeNumber: 1, sortOrder: 0 },
  { id: "ep0002", seasonNumber: 1, episodeNumber: 2, sortOrder: 0 },
  { id: "sp0001", seasonNumber: 0, episodeNumber: 1, sortOrder: 0 },
  { id: "ep0003", seasonNumber: 2, episodeNumber: 1, sortOrder: 0 },
];

describe("tv episode ordering", () => {
  it("orders regular seasons before specials by default", () => {
    const ordered = [...episodes].sort((a, b) => compareEpisodes(a, b));
    expect(ordered.map((e) => e.id)).toEqual([
      "ep0001",
      "ep0002",
      "ep0003",
      "sp0001",
    ]);
  });

  it("resumes in-progress episode before next unwatched", () => {
    const progress = new Map([
      [
        "ep0001",
        {
          kind: "playback" as const,
          positionSeconds: 120,
          durationSeconds: 3600,
        },
      ],
      [
        "ep0002",
        {
          kind: "playback" as const,
          positionSeconds: 0,
          durationSeconds: 3600,
          completed: true,
        },
      ],
    ]);
    const next = resolveContinueEpisode(episodes, progress);
    expect(next?.id).toBe("ep0001");
  });

  it("skips completed episodes for continue", () => {
    const progress = new Map([
      [
        "ep0001",
        {
          kind: "playback" as const,
          positionSeconds: 0,
          durationSeconds: 3600,
          completed: true,
        },
      ],
    ]);
    const next = resolveContinueEpisode(episodes, progress);
    expect(next?.id).toBe("ep0002");
  });

  it("returns null when all episodes are complete", () => {
    const progress = new Map(
      episodes.map((episode) => [
        episode.id,
        {
          kind: "playback" as const,
          positionSeconds: 0,
          durationSeconds: 100,
          completed: true,
        },
      ]),
    );
    expect(resolveContinueEpisode(episodes, progress)).toBeNull();
  });

  it("builds queue from start episode forward", () => {
    const queue = listEpisodesForQueue(episodes, "ep0002");
    expect(queue.map((e) => e.id)).toEqual(["ep0002", "ep0003", "sp0001"]);
  });

  it("advances to next episode in canonical order", () => {
    const next = getNextEpisode(episodes, "ep0002");
    expect(next?.id).toBe("ep0003");
  });
});
