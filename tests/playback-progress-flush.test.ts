import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPlaybackProgress } from "../src/web/playback/persistence/usePlaybackProgress.js";
import type { PlaybackState } from "../src/web/playback/context/playbackReducer.js";
import { createInitialPlaybackState } from "../src/web/playback/context/playbackReducer.js";
import type { PlaybackManifest } from "../src/shared/playback.js";

const manifest: PlaybackManifest = {
  subject: { type: "audiobook", id: "ab001" },
  representationId: "550e8400-e29b-41d4-a716-446655440000",
  title: "Sample",
  mediaKind: "audio",
  sessionMode: "ephemeral",
  sources: [
    {
      fileId: "550e8400-e29b-41d4-a716-446655440001",
      url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
    },
  ],
};

vi.mock("../src/web/app/api.js", () => ({
  api: vi.fn(),
}));

import { api } from "../src/web/app/api.js";

describe("flushPlaybackProgress", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/settings/playback") {
        return { data: { progressSyncEnabled: true } };
      }
      if (path === "/playback/progress" && options?.method === "PUT") {
        return {};
      }
      return {};
    });
  });

  it("writes progress for an active session", async () => {
    let state: PlaybackState = createInitialPlaybackState();
    state = {
      ...state,
      status: "paused",
      currentItem: { ...manifest, id: "queue-item-1" },
      positionSeconds: 42,
      durationSeconds: 120,
      queue: [{ ...manifest, id: "queue-item-1" }],
      queueIndex: 0,
    };

    await flushPlaybackProgress(state);

    expect(api).toHaveBeenCalledWith("/playback/progress", {
      method: "PUT",
      body: JSON.stringify({
        subjectType: "audiobook",
        subjectId: "ab001",
        representationId: manifest.representationId,
        locator: {
          kind: "playback",
          positionSeconds: 42,
          durationSeconds: 120,
          completed: false,
        },
      }),
    });
  });

  it("skips when there is no current item", async () => {
    await flushPlaybackProgress(createInitialPlaybackState());
    expect(api).not.toHaveBeenCalled();
  });
});
