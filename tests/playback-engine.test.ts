import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../src/web/playback/engine/AudioEngine.js";
import type { PlaybackEngine } from "../src/web/playback/engine/PlaybackEngine.js";

type MockAudio = {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  listeners: Record<string, Array<() => void>>;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
  removeAttribute: (name: string) => void;
  load: () => void;
  play: () => Promise<void>;
  pause: () => void;
};

function createMockAudio(): MockAudio {
  return {
    src: "",
    currentTime: 0,
    duration: 120,
    paused: true,
    volume: 1,
    listeners: {},
    addEventListener(type, cb) {
      this.listeners[type] ??= [];
      this.listeners[type].push(cb);
    },
    removeEventListener(type, cb) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== cb);
    },
    removeAttribute(name) {
      if (name === "src") this.src = "";
    },
    load() {
      this.listeners.loadedmetadata?.forEach((cb) => cb());
      this.listeners.canplay?.forEach((cb) => cb());
    },
    async play() {
      this.paused = false;
      this.listeners.play?.forEach((cb) => cb());
    },
    pause() {
      this.paused = true;
      this.listeners.pause?.forEach((cb) => cb());
    },
  };
}

function runPlaybackEngineContract(createEngine: () => PlaybackEngine) {
  describe("PlaybackEngine contract", () => {
    let engine: PlaybackEngine;

    beforeEach(() => {
      engine = createEngine();
    });

    afterEach(() => {
      engine.destroy();
    });

    it("loads sources and reports duration", async () => {
      const states: string[] = [];
      engine.onStateChange((state) => states.push(state.status));
      await engine.load([
        {
          fileId: "550e8400-e29b-41d4-a716-446655440001",
          url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
          durationSeconds: 120,
        },
      ]);
      expect(engine.getDuration()).toBe(120);
      expect(states).toContain("loading");
      expect(states.at(-1)).toBe("paused");
    });

    it("play and pause transition", async () => {
      await engine.load([
        {
          fileId: "550e8400-e29b-41d4-a716-446655440001",
          url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
        },
      ]);
      await engine.play();
      engine.pause();
      expect(engine.getPosition()).toBeGreaterThanOrEqual(0);
    });

    it("seek updates position", async () => {
      await engine.load([
        {
          fileId: "550e8400-e29b-41d4-a716-446655440001",
          url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
        },
      ]);
      engine.seek(45);
      expect(engine.getPosition()).toBe(45);
    });
  });
}

describe("AudioEngine", () => {
  let mockAudio: MockAudio;

  beforeEach(() => {
    mockAudio = createMockAudio();
    vi.stubGlobal(
      "Audio",
      vi.fn(function Audio() {
        return mockAudio;
      }),
    );
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-audio");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  runPlaybackEngineContract(() => new AudioEngine(() => mockAudio as unknown as HTMLAudioElement));

  it("replaces source when loading new sources", async () => {
    const engine = new AudioEngine(() => mockAudio as unknown as HTMLAudioElement);
    await engine.load([
      {
        fileId: "550e8400-e29b-41d4-a716-446655440001",
        url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
      },
    ]);
    await engine.load([
      {
        fileId: "550e8400-e29b-41d4-a716-446655440002",
        url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440002/content",
      },
    ]);
    expect(mockAudio.src).toContain("blob:mock-audio");
    engine.destroy();
  });

  it("enters error state on media error", async () => {
    const engine = new AudioEngine(() => mockAudio as unknown as HTMLAudioElement);
    const statuses: string[] = [];
    engine.onStateChange((state) => statuses.push(state.status));
    await engine.load([
      {
        fileId: "550e8400-e29b-41d4-a716-446655440001",
        url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
      },
    ]);
    mockAudio.listeners.error?.forEach((cb) => cb());
    expect(statuses).toContain("error");
    engine.destroy();
  });

  it("syncs paused state from native pause event", async () => {
    const engine = new AudioEngine(() => mockAudio as unknown as HTMLAudioElement);
    const statuses: string[] = [];
    engine.onStateChange((state) => statuses.push(state.status));
    await engine.load([
      {
        fileId: "550e8400-e29b-41d4-a716-446655440001",
        url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
      },
    ]);
    await engine.play();
    mockAudio.pause();
    expect(statuses).toContain("paused");
    engine.destroy();
  });

  it("sets and reads volume", async () => {
    const engine = new AudioEngine(() => mockAudio as unknown as HTMLAudioElement);
    engine.setVolume(0.5);
    await engine.load([
      {
        fileId: "550e8400-e29b-41d4-a716-446655440001",
        url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
      },
    ]);
    expect(engine.getVolume()).toBe(0.5);
    expect(mockAudio.volume).toBe(0.5);
    engine.destroy();
  });
});
