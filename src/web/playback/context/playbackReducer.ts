import type {
  PlaybackItem,
  PlaybackManifest,
  PlaybackSessionMode,
  PlaybackStatus,
} from "@shared/playback";
import { generateId } from "../utils/id";

export interface PlaybackState {
  status: PlaybackStatus;
  currentItem: PlaybackItem | null;
  positionSeconds: number;
  durationSeconds: number | null;
  queue: PlaybackItem[];
  queueIndex: number;
  error: string | null;
  expanded: boolean;
  sessionMode: PlaybackSessionMode;
}

export type PlaybackAction =
  | { type: "PLAY_MANIFEST"; manifest: PlaybackManifest; append?: boolean }
  | { type: "PLAY_QUEUE_INDEX"; index: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SEEK"; positionSeconds: number }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "REMOVE_FROM_QUEUE"; index: number }
  | { type: "CLEAR_QUEUE" }
  | { type: "STOP_PLAYBACK" }
  | { type: "SESSION_ENDED" }
  | { type: "ENGINE_STATE"; status: PlaybackStatus; positionSeconds: number; durationSeconds: number | null; error: string | null }
  | { type: "SET_EXPANDED"; expanded: boolean }
  | { type: "SET_ERROR"; error: string | null };

export function manifestToItem(manifest: PlaybackManifest): PlaybackItem {
  return {
    ...manifest,
    id: generateId(),
  };
}

export function createInitialPlaybackState(): PlaybackState {
  return {
    status: "idle",
    currentItem: null,
    positionSeconds: 0,
    durationSeconds: null,
    queue: [],
    queueIndex: -1,
    error: null,
    expanded: false,
    sessionMode: "ephemeral",
  };
}

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case "PLAY_MANIFEST": {
      const item = manifestToItem(action.manifest);
      const sessionMode = action.manifest.sessionMode ?? "ephemeral";
      if (action.append) {
        const queue = [...state.queue, item];
        if (state.queue.length === 0) {
          return {
            ...state,
            queue,
            queueIndex: 0,
            currentItem: item,
            status: "loading",
            positionSeconds: 0,
            durationSeconds: null,
            error: null,
            sessionMode,
          };
        }
        return { ...state, queue };
      }
      return {
        ...state,
        queue: [item],
        queueIndex: 0,
        currentItem: item,
        status: "loading",
        positionSeconds: 0,
        durationSeconds: null,
        error: null,
        sessionMode,
      };
    }
    case "PLAY_QUEUE_INDEX": {
      const item = state.queue[action.index];
      if (!item) return state;
      return {
        ...state,
        queueIndex: action.index,
        currentItem: item,
        status: "loading",
        positionSeconds: 0,
        durationSeconds: null,
        error: null,
      };
    }
    case "PAUSE":
      return state.status === "playing" || state.status === "loading"
        ? { ...state, status: "paused" }
        : state;
    case "RESUME":
      return state.status === "paused"
        ? { ...state, status: "playing" }
        : state;
    case "SEEK":
      return { ...state, positionSeconds: action.positionSeconds };
    case "NEXT": {
      if (state.queueIndex >= state.queue.length - 1) return state;
      const nextIndex = state.queueIndex + 1;
      return {
        ...state,
        queueIndex: nextIndex,
        currentItem: state.queue[nextIndex] ?? null,
        status: "loading",
        positionSeconds: 0,
        durationSeconds: null,
        error: null,
      };
    }
    case "PREVIOUS": {
      if (state.queueIndex <= 0) {
        return { ...state, positionSeconds: 0 };
      }
      const prevIndex = state.queueIndex - 1;
      return {
        ...state,
        queueIndex: prevIndex,
        currentItem: state.queue[prevIndex] ?? null,
        status: "loading",
        positionSeconds: 0,
        durationSeconds: null,
        error: null,
      };
    }
    case "REMOVE_FROM_QUEUE": {
      const queue = state.queue.filter((_, i) => i !== action.index);
      let queueIndex = state.queueIndex;
      if (action.index < state.queueIndex) queueIndex -= 1;
      if (action.index === state.queueIndex) {
        const currentItem = queue[queueIndex] ?? null;
        return {
          ...state,
          queue,
          queueIndex: currentItem ? queueIndex : -1,
          currentItem,
          status: currentItem ? "loading" : "idle",
          positionSeconds: 0,
          durationSeconds: null,
        };
      }
      return { ...state, queue, queueIndex };
    }
    case "CLEAR_QUEUE":
    case "STOP_PLAYBACK":
      return createInitialPlaybackState();
    case "SESSION_ENDED":
      return state.currentItem
        ? {
            ...state,
            status: "ended",
            expanded: false,
            sessionMode: state.sessionMode,
          }
        : state;
    case "ENGINE_STATE":
      return {
        ...state,
        status: action.status,
        positionSeconds: action.positionSeconds,
        durationSeconds: action.durationSeconds,
        error: action.error,
      };
    case "SET_EXPANDED":
      return { ...state, expanded: action.expanded };
    case "SET_ERROR":
      return { ...state, error: action.error, status: "error" };
    default:
      return state;
  }
}
