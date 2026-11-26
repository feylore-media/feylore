import type { PlaybackSource } from "@shared/playback";
import { readStoredVolume } from "../volume";
import {
  isAuthenticatedFileContentUrl,
  toAbsoluteApiUrl,
} from "../../lib/urls";
import {
  createInitialEngineState,
  type EngineState,
  type PlaybackEngine,
} from "./PlaybackEngine";

type AudioFactory = () => HTMLAudioElement;

const defaultAudioFactory: AudioFactory = () => new Audio();

export class AudioEngine implements PlaybackEngine {
  private audio: HTMLAudioElement | null = null;
  private sources: PlaybackSource[] = [];
  private sourceIndex = 0;
  private objectUrl: string | null = null;
  private state: EngineState = createInitialEngineState();
  private volume = readStoredVolume();
  private listeners = new Set<(state: EngineState) => void>();
  private boundHandlers: {
    timeupdate: () => void;
    ended: () => void;
    error: () => void;
    loadedmetadata: () => void;
    canplay: () => void;
    play: () => void;
    pause: () => void;
  } | null = null;

  constructor(private readonly createAudio: AudioFactory = defaultAudioFactory) {}

  private emit(partial: Partial<EngineState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  onStateChange(cb: (state: EngineState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private revokeObjectUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private detachAudio() {
    if (!this.audio || !this.boundHandlers) return;
    this.audio.removeEventListener("timeupdate", this.boundHandlers.timeupdate);
    this.audio.removeEventListener("ended", this.boundHandlers.ended);
    this.audio.removeEventListener("error", this.boundHandlers.error);
    this.audio.removeEventListener(
      "loadedmetadata",
      this.boundHandlers.loadedmetadata,
    );
    this.audio.removeEventListener("canplay", this.boundHandlers.canplay);
    this.audio.removeEventListener("play", this.boundHandlers.play);
    this.audio.removeEventListener("pause", this.boundHandlers.pause);
    this.audio.pause();
    this.revokeObjectUrl();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.audio = null;
    this.boundHandlers = null;
  }

  private attachAudio() {
    this.detachAudio();
    this.audio = this.createAudio();
    this.audio.volume = this.volume;
    this.boundHandlers = {
      timeupdate: () => {
        if (!this.audio) return;
        this.emit({
          positionSeconds: this.audio.currentTime,
          durationSeconds: Number.isFinite(this.audio.duration)
            ? this.audio.duration
            : this.state.durationSeconds,
        });
      },
      ended: () => {
        if (this.sourceIndex < this.sources.length - 1) {
          this.sourceIndex += 1;
          void this.loadCurrentSource(true);
          return;
        }
        this.emit({ status: "ended" });
      },
      error: () => {
        this.emit({
          status: "error",
          error: "Playback failed",
        });
      },
      loadedmetadata: () => {
        if (!this.audio) return;
        this.emit({
          durationSeconds: Number.isFinite(this.audio.duration)
            ? this.audio.duration
            : this.state.durationSeconds,
        });
      },
      canplay: () => {
        if (this.state.status === "loading") {
          this.emit({ status: "paused" });
        }
      },
      play: () => {
        if (this.state.status !== "playing") {
          this.emit({ status: "playing", error: null });
        }
      },
      pause: () => {
        if (this.state.status === "playing") {
          this.emit({ status: "paused" });
        }
      },
    };

    this.audio.addEventListener("timeupdate", this.boundHandlers.timeupdate);
    this.audio.addEventListener("ended", this.boundHandlers.ended);
    this.audio.addEventListener("error", this.boundHandlers.error);
    this.audio.addEventListener(
      "loadedmetadata",
      this.boundHandlers.loadedmetadata,
    );
    this.audio.addEventListener("canplay", this.boundHandlers.canplay);
    this.audio.addEventListener("play", this.boundHandlers.play);
    this.audio.addEventListener("pause", this.boundHandlers.pause);
  }

  private currentSource(): PlaybackSource | null {
    return this.sources[this.sourceIndex] ?? null;
  }

  private async resolveSourceUrl(source: PlaybackSource): Promise<string> {
    const absolute = toAbsoluteApiUrl(source.url);
    if (!isAuthenticatedFileContentUrl(source.url)) {
      return absolute;
    }

    const response = await fetch(absolute, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Playback failed (${response.status})`);
    }
    const blob = await response.blob();
    this.revokeObjectUrl();
    this.objectUrl = URL.createObjectURL(blob);
    return this.objectUrl;
  }

  private async loadCurrentSource(autoplay = false) {
    const source = this.currentSource();
    if (!source) {
      this.emit({
        status: "error",
        error: "No playback source",
      });
      return;
    }

    if (!this.audio) {
      this.attachAudio();
    }
    if (!this.audio) return;

    this.emit({ status: "loading", error: null });

    try {
      const mediaUrl = await this.resolveSourceUrl(source);
      this.audio.src = mediaUrl;
      this.audio.load();
    } catch (err) {
      this.emit({
        status: "error",
        error: err instanceof Error ? err.message : "Playback failed",
      });
      return;
    }

    if (source.durationSeconds) {
      this.emit({ durationSeconds: source.durationSeconds });
    }

    if (autoplay) {
      await this.play();
    }
  }

  async load(sources: PlaybackSource[]): Promise<void> {
    this.sources = sources;
    this.sourceIndex = 0;
    this.emit({
      ...createInitialEngineState(),
      status: "loading",
    });
    await this.loadCurrentSource(false);
  }

  async play(): Promise<void> {
    if (!this.audio && this.sources.length > 0) {
      await this.loadCurrentSource(false);
    }
    if (!this.audio) return;
    try {
      await this.audio.play();
      this.emit({ status: "playing", error: null });
    } catch {
      this.emit({
        status: "error",
        error: "Playback was blocked",
      });
    }
  }

  pause(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.emit({ status: "paused" });
  }

  seek(positionSeconds: number): void {
    if (!this.audio) return;
    const duration = this.getDuration();
    const clamped =
      duration > 0
        ? Math.min(Math.max(positionSeconds, 0), duration)
        : Math.max(positionSeconds, 0);
    this.audio.currentTime = clamped;
    this.emit({ positionSeconds: clamped });
  }

  getPosition(): number {
    return this.audio?.currentTime ?? this.state.positionSeconds;
  }

  getDuration(): number {
    const fromAudio = this.audio?.duration;
    if (fromAudio && Number.isFinite(fromAudio)) return fromAudio;
    const fromSource = this.currentSource()?.durationSeconds;
    if (fromSource) return fromSource;
    return this.state.durationSeconds ?? 0;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  destroy(): void {
    this.detachAudio();
    this.revokeObjectUrl();
    this.sources = [];
    this.sourceIndex = 0;
    this.listeners.clear();
    this.state = createInitialEngineState();
  }
}

export function createAudioEngine(
  createAudio: AudioFactory = defaultAudioFactory,
): PlaybackEngine {
  return new AudioEngine(createAudio);
}
