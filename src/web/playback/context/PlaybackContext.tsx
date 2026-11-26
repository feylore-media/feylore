import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createContext, useContext } from "react";
import type { PlaybackManifest } from "@shared/playback";
import { resolvePlaybackResumePosition } from "@shared/playback";
import { api } from "../../app/api";
import { createAudioEngine } from "../engine/AudioEngine";
import { createVideoEngine, VideoEngine } from "../engine/VideoEngine";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import {
  createInitialPlaybackState,
  playbackReducer,
  type PlaybackState,
} from "./playbackReducer";
import { bindMediaSession } from "../mediaSession/bindMediaSession";
import {
  flushPlaybackProgress,
  usePlaybackProgressSync,
} from "../persistence/usePlaybackProgress";
import { usePlayerPresence } from "../../presence/usePlayerPresence";
import { readStoredVolume, writeStoredVolume } from "../volume";

const FINISHED_AUTO_DISMISS_MS = 8000;

export interface PlaybackContextValue {
  state: PlaybackState;
  playManifest: (
    manifest: PlaybackManifest,
    options?: { append?: boolean },
  ) => Promise<void>;
  pause: () => void;
  resume: () => void;
  seek: (positionSeconds: number) => void;
  next: () => void;
  previous: () => void;
  removeFromQueue: (index: number) => void;
  stopPlayback: () => void;
  replay: () => void;
  setExpanded: (expanded: boolean) => void;
  setVolume: (volume: number) => void;
  volume: number;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function createEngineForItem(
  item: PlaybackState["currentItem"],
): PlaybackEngine | null {
  if (!item) return null;
  if (item.mediaKind === "audio") {
    const engine = createAudioEngine();
    engine.setVolume(readStoredVolume());
    return engine;
  }
  if (item.mediaKind === "video") {
    const engine = createVideoEngine() as VideoEngine;
    engine.setVolume(readStoredVolume());
    (window as unknown as { __feyloreVideoEngine?: VideoEngine }).__feyloreVideoEngine =
      engine;
    return engine;
  }
  return null;
}

export function isPersistentSession(state: PlaybackState): boolean {
  return (
    state.sessionMode === "persistent" &&
    state.currentItem !== null &&
    state.status !== "idle"
  );
}

export function isPlayerVisible(state: PlaybackState): boolean {
  if (!state.currentItem || state.status === "error") return false;
  if (state.sessionMode === "persistent") {
    return state.status !== "idle";
  }
  return state.status !== "idle";
}

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    playbackReducer,
    undefined,
    createInitialPlaybackState,
  );
  const engineRef = useRef<PlaybackEngine | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const sessionTokenRef = useRef(0);
  const engineSessionTokenRef = useRef(0);
  const pendingAutoplayRef = useRef(false);
  const finishedDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [volume, setVolumeState] = useStateVolume();

  const beginSession = useCallback(() => {
    sessionTokenRef.current += 1;
    return sessionTokenRef.current;
  }, []);

  const isCurrentSession = useCallback((token: number) => {
    return token === sessionTokenRef.current;
  }, []);

  const clearFinishedDismissTimer = useCallback(() => {
    if (finishedDismissTimerRef.current) {
      clearTimeout(finishedDismissTimerRef.current);
      finishedDismissTimerRef.current = null;
    }
  }, []);

  const destroyEngine = useCallback(() => {
    engineSessionTokenRef.current += 1;
    engineRef.current?.destroy();
    engineRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    pendingAutoplayRef.current = false;
    clearFinishedDismissTimer();
    const snapshot = stateRef.current;
    void flushPlaybackProgress(snapshot);
    beginSession();
    destroyEngine();
    dispatch({ type: "STOP_PLAYBACK" });
  }, [beginSession, clearFinishedDismissTimer, destroyEngine]);

  const scheduleFinishedDismiss = useCallback(() => {
    clearFinishedDismissTimer();
    const token = sessionTokenRef.current;
    finishedDismissTimerRef.current = setTimeout(() => {
      if (!isCurrentSession(token)) return;
      stopPlayback();
    }, FINISHED_AUTO_DISMISS_MS);
  }, [clearFinishedDismissTimer, isCurrentSession, stopPlayback]);

  const syncEngineState = useCallback(
    (
      token: number,
      engineState: {
        status: PlaybackState["status"];
        positionSeconds: number;
        durationSeconds: number | null;
        error: string | null;
      },
    ) => {
      if (!isCurrentSession(token)) return;

      dispatch({
        type: "ENGINE_STATE",
        status: engineState.status,
        positionSeconds: engineState.positionSeconds,
        durationSeconds: engineState.durationSeconds,
        error: engineState.error,
      });

      if (engineState.status === "ended") {
        const current = stateRef.current;
        if (current.queueIndex < current.queue.length - 1) {
          dispatch({ type: "NEXT" });
          return;
        }
        void flushPlaybackProgress({
          ...current,
          status: "ended",
          positionSeconds: engineState.positionSeconds,
          durationSeconds: engineState.durationSeconds,
        });
        dispatch({ type: "SESSION_ENDED" });
        if (current.sessionMode !== "persistent") {
          scheduleFinishedDismiss();
        }
      }
    },
    [isCurrentSession, scheduleFinishedDismiss],
  );

  const loadCurrentItem = useCallback(
    async (
      token: number,
      item: NonNullable<PlaybackState["currentItem"]>,
      resumeSeconds = 0,
    ) => {
      if (!isCurrentSession(token)) return;

      destroyEngine();
      const engine = createEngineForItem(item);
      if (!engine) {
        if (!isCurrentSession(token)) return;
        dispatch({ type: "SET_ERROR", error: "Unsupported media kind" });
        return;
      }

      const engineToken = ++engineSessionTokenRef.current;
      engineRef.current = engine;

      engine.onStateChange((engineState) => {
        if (engineSessionTokenRef.current !== engineToken) return;
        syncEngineState(token, {
          status: engineState.status,
          positionSeconds: engineState.positionSeconds,
          durationSeconds: engineState.durationSeconds,
          error: engineState.error,
        });
      });

      await engine.load(item.sources);
      if (!isCurrentSession(token)) return;

      if (resumeSeconds > 0) {
        engine.seek(resumeSeconds);
      }
    },
    [destroyEngine, isCurrentSession, syncEngineState],
  );

  useEffect(() => {
    const item = state.currentItem;
    if (!item || state.status !== "loading") return;

    const token = sessionTokenRef.current;
    let cancelled = false;
    pendingAutoplayRef.current = true;

    void (async () => {
      let resumeSeconds = 0;
      try {
        const progressRes = await api<{
          data: {
            locator: {
              kind: "playback";
              positionSeconds: number;
              durationSeconds?: number;
              completed?: boolean;
            };
          } | null;
        }>(
          `/playback/progress?subjectType=${encodeURIComponent(item.subject.type)}&subjectId=${encodeURIComponent(item.subject.id)}`,
        );
        resumeSeconds = resolvePlaybackResumePosition(progressRes.data?.locator);
      } catch {
        resumeSeconds = 0;
      }

      if (cancelled || !isCurrentSession(token)) return;

      await loadCurrentItem(token, item, resumeSeconds);
      if (cancelled || !isCurrentSession(token)) return;
      if (!pendingAutoplayRef.current) return;

      pendingAutoplayRef.current = false;
      dispatch({ type: "RESUME" });
      await engineRef.current?.play();
    })();

    return () => {
      cancelled = true;
    };
  }, [state.currentItem, state.status, isCurrentSession, loadCurrentItem]);

  useEffect(() => {
    return () => {
      destroyEngine();
      clearFinishedDismissTimer();
    };
  }, [destroyEngine, clearFinishedDismissTimer]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const snapshot = stateRef.current;
      if (!isPlayerVisible(snapshot)) return;
      void flushPlaybackProgress(snapshot);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  usePlaybackProgressSync(state);
  usePlayerPresence(state);

  useEffect(() => {
    const item = state.currentItem;
    const status = state.status;
    const positionSeconds = state.positionSeconds;
    const token = sessionTokenRef.current;

    return bindMediaSession({
      state: { ...state, currentItem: item, status, positionSeconds },
      onPlay: () => {
        if (!isCurrentSession(token)) return;
        void engineRef.current?.play();
      },
      onPause: () => {
        if (!isCurrentSession(token)) return;
        engineRef.current?.pause();
        dispatch({ type: "PAUSE" });
      },
      onSeek: (position) => {
        if (!isCurrentSession(token)) return;
        engineRef.current?.seek(position);
      },
      onPrevious: () => {
        if (!isCurrentSession(token)) return;
        dispatch({ type: "PREVIOUS" });
      },
      onNext: () => {
        if (!isCurrentSession(token)) return;
        dispatch({ type: "NEXT" });
      },
    });
  }, [
    state.currentItem,
    state.status,
    state.positionSeconds,
    state.durationSeconds,
    state.queue,
    state.queueIndex,
    state.error,
    state.expanded,
    isCurrentSession,
  ]);

  const playManifest = useCallback(
    async (manifest: PlaybackManifest, options?: { append?: boolean }) => {
      clearFinishedDismissTimer();
      const shouldBeginSession =
        !options?.append || stateRef.current.queue.length === 0;
      if (shouldBeginSession) {
        beginSession();
      }
      dispatch({
        type: "PLAY_MANIFEST",
        manifest,
        append: options?.append,
      });
    },
    [beginSession, clearFinishedDismissTimer],
  );

  const pause = useCallback(() => {
    pendingAutoplayRef.current = false;
    dispatch({ type: "PAUSE" });
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: "RESUME" });
    void engineRef.current?.play();
  }, []);

  const seek = useCallback((positionSeconds: number) => {
    engineRef.current?.seek(positionSeconds);
    dispatch({ type: "SEEK", positionSeconds });
  }, []);

  const replay = useCallback(() => {
    const item = stateRef.current.currentItem;
    if (!item) return;
    clearFinishedDismissTimer();
    const manifest: PlaybackManifest = {
      subject: item.subject,
      representationId: item.representationId,
      title: item.title,
      subtitle: item.subtitle,
      artworkUrl: item.artworkUrl,
      mediaKind: item.mediaKind,
      sources: item.sources,
      sessionMode: item.sessionMode,
    };
    void playManifest(manifest);
  }, [clearFinishedDismissTimer, playManifest]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.min(1, Math.max(0, nextVolume));
    setVolumeState(clamped);
    writeStoredVolume(clamped);
    engineRef.current?.setVolume(clamped);
  }, [setVolumeState]);

  const value = useMemo<PlaybackContextValue>(
    () => ({
      state,
      playManifest,
      pause,
      resume,
      seek,
      next: () => dispatch({ type: "NEXT" }),
      previous: () => dispatch({ type: "PREVIOUS" }),
      removeFromQueue: (index) =>
        dispatch({ type: "REMOVE_FROM_QUEUE", index }),
      stopPlayback,
      replay,
      setExpanded: (expanded) =>
        dispatch({ type: "SET_EXPANDED", expanded }),
      setVolume,
      volume,
    }),
    [
      state,
      playManifest,
      pause,
      resume,
      seek,
      stopPlayback,
      replay,
      setVolume,
      volume,
    ],
  );

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}

function useStateVolume(): [number, (volume: number) => void] {
  const [volume, setVolumeState] = useState(readStoredVolume);
  return [volume, setVolumeState];
}

export function usePlayback(): PlaybackContextValue {
  const ctx = useContext(PlaybackContext);
  if (!ctx) {
    throw new Error("usePlayback must be used within PlaybackProvider");
  }
  return ctx;
}

export function useOptionalPlayback(): PlaybackContextValue | null {
  return useContext(PlaybackContext);
}

export function isActivePlaybackSubject(
  state: PlaybackState,
  subjectType: string,
  subjectId: string,
): boolean {
  const item = state.currentItem;
  if (!item) return false;
  return (
    item.subject.type === subjectType &&
    item.subject.id === subjectId &&
    isPlayerVisible(state)
  );
}
