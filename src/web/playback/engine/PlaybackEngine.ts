import type { PlaybackSource } from "@shared/playback";

export type EngineStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface EngineState {
  status: EngineStatus;
  positionSeconds: number;
  durationSeconds: number | null;
  error: string | null;
}

export interface PlaybackEngine {
  load(sources: PlaybackSource[]): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(positionSeconds: number): void;
  getPosition(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  destroy(): void;
  onStateChange(cb: (state: EngineState) => void): () => void;
}

export function createInitialEngineState(): EngineState {
  return {
    status: "idle",
    positionSeconds: 0,
    durationSeconds: null,
    error: null,
  };
}
