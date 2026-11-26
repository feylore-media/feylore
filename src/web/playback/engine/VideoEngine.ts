import type { PlaybackSource } from "@shared/playback";
import type Hls from "hls.js";
import { readStoredVolume } from "../volume";
import { toAbsoluteApiUrl } from "../../lib/urls";
import {
  createInitialEngineState,
  type EngineState,
  type PlaybackEngine,
} from "./PlaybackEngine";

type VideoFactory = () => HTMLVideoElement;

const defaultVideoFactory: VideoFactory = () => document.createElement("video");

export class VideoEngine implements PlaybackEngine {
  private video: HTMLVideoElement | null = null;
  private hls: Hls | null = null;
  private sources: PlaybackSource[] = [];
  private sourceIndex = 0;
  private state: EngineState = createInitialEngineState();
  private volume = readStoredVolume();
  private muted = false;
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

  constructor(
    private readonly createVideo: VideoFactory = defaultVideoFactory,
  ) {}

  /** Mount the video element into a container for display. */
  attachTo(container: HTMLElement) {
    if (!this.video) {
      this.attachVideo();
    }
    if (this.video && this.video.parentElement !== container) {
      container.replaceChildren(this.video);
    }
  }

  getMediaElement(): HTMLVideoElement | null {
    return this.video;
  }

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

  private destroyHls() {
    if (!this.hls) return;
    this.hls.destroy();
    this.hls = null;
  }

  private detachVideo() {
    this.destroyHls();
    if (!this.video || !this.boundHandlers) return;
    this.video.removeEventListener("timeupdate", this.boundHandlers.timeupdate);
    this.video.removeEventListener("ended", this.boundHandlers.ended);
    this.video.removeEventListener("error", this.boundHandlers.error);
    this.video.removeEventListener(
      "loadedmetadata",
      this.boundHandlers.loadedmetadata,
    );
    this.video.removeEventListener("canplay", this.boundHandlers.canplay);
    this.video.removeEventListener("play", this.boundHandlers.play);
    this.video.removeEventListener("pause", this.boundHandlers.pause);
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.video = null;
    this.boundHandlers = null;
  }

  private attachVideo() {
    this.detachVideo();
    this.video = this.createVideo();
    this.video.playsInline = true;
    this.video.preload = "metadata";
    this.video.volume = this.volume;
    this.video.muted = this.muted;

    this.boundHandlers = {
      timeupdate: () => {
        if (!this.video) return;
        this.emit({
          positionSeconds: this.video.currentTime,
          durationSeconds: Number.isFinite(this.video.duration)
            ? this.video.duration
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
        if (!this.video) return;
        this.emit({
          durationSeconds: Number.isFinite(this.video.duration)
            ? this.video.duration
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

    this.video.addEventListener("timeupdate", this.boundHandlers.timeupdate);
    this.video.addEventListener("ended", this.boundHandlers.ended);
    this.video.addEventListener("error", this.boundHandlers.error);
    this.video.addEventListener(
      "loadedmetadata",
      this.boundHandlers.loadedmetadata,
    );
    this.video.addEventListener("canplay", this.boundHandlers.canplay);
    this.video.addEventListener("play", this.boundHandlers.play);
    this.video.addEventListener("pause", this.boundHandlers.pause);
  }

  private currentSource(): PlaybackSource | null {
    return this.sources[this.sourceIndex] ?? null;
  }

  private resolveSourceUrl(source: PlaybackSource): string {
    if (source.url.startsWith("http://") || source.url.startsWith("https://")) {
      return source.url;
    }
    return toAbsoluteApiUrl(source.url);
  }

  private isHlsSource(source: PlaybackSource, mediaUrl: string): boolean {
    if (source.mimeType === "application/vnd.apple.mpegurl") return true;
    return mediaUrl.includes(".m3u8");
  }

  private async attachMediaSource(mediaUrl: string, source: PlaybackSource) {
    const video = this.video;
    if (!video) return;

    if (!this.isHlsSource(source, mediaUrl)) {
      this.destroyHls();
      video.src = mediaUrl;
      video.load();
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      this.destroyHls();
      video.src = mediaUrl;
      video.load();
      return;
    }

    const { default: HlsPlayer } = await import("hls.js");
    if (this.video !== video) return;
    if (!HlsPlayer.isSupported()) {
      throw new Error("HLS playback is not supported in this browser");
    }

    this.destroyHls();
    video.removeAttribute("src");
    video.load();
    this.hls = new HlsPlayer();
    this.hls.loadSource(mediaUrl);
    this.hls.attachMedia(video);
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

    if (!this.video) {
      this.attachVideo();
    }
    if (!this.video) return;

    this.emit({ status: "loading", error: null });

    try {
      const mediaUrl = this.resolveSourceUrl(source);
      await this.attachMediaSource(mediaUrl, source);
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
    if (!this.video && this.sources.length > 0) {
      await this.loadCurrentSource(false);
    }
    if (!this.video) return;
    try {
      await this.video.play();
      this.emit({ status: "playing", error: null });
    } catch {
      this.emit({
        status: "error",
        error: "Playback was blocked",
      });
    }
  }

  pause(): void {
    if (!this.video) return;
    this.video.pause();
    this.emit({ status: "paused" });
  }

  seek(positionSeconds: number): void {
    if (!this.video) return;
    const duration = this.getDuration();
    const clamped =
      duration > 0
        ? Math.min(Math.max(positionSeconds, 0), duration)
        : Math.max(positionSeconds, 0);
    this.video.currentTime = clamped;
    this.emit({ positionSeconds: clamped });
  }

  getPosition(): number {
    return this.video?.currentTime ?? this.state.positionSeconds;
  }

  getDuration(): number {
    const fromVideo = this.video?.duration;
    if (fromVideo && Number.isFinite(fromVideo)) return fromVideo;
    const fromSource = this.currentSource()?.durationSeconds;
    if (fromSource) return fromSource;
    return this.state.durationSeconds ?? 0;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.video) {
      this.video.volume = this.volume;
      if (this.volume > 0) {
        this.muted = false;
        this.video.muted = false;
      }
    }
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.video) {
      this.video.muted = muted;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  destroy(): void {
    this.destroyHls();
    this.detachVideo();
    this.sources = [];
    this.sourceIndex = 0;
    this.listeners.clear();
    this.state = createInitialEngineState();
  }
}

export function createVideoEngine(
  createVideo: VideoFactory = defaultVideoFactory,
): PlaybackEngine {
  return new VideoEngine(createVideo);
}
