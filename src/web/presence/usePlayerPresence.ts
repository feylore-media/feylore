import { useEffect, useRef } from "react";
import { api } from "../app/api";
import type { PlaybackState } from "../playback/context/playbackReducer";

const HEARTBEAT_MS = 25_000;

const PRESENCE_SUBJECTS = new Set([
  "audiobook",
  "podcast_episode",
  "track",
  "album",
  "movie",
  "tv_episode",
]);

function kindForMedia(mediaKind: string): "listening" | "watching" {
  return mediaKind === "video" ? "watching" : "listening";
}

/**
 * Feylore player presence producer (Presence 1.0).
 *
 * - play → start/resume (new session per item)
 * - playing → heartbeat every 25s
 * - pause → one paused touch, then grace period server-side
 * - stop/close/finish → end
 *
 * Presence observes playback; progress persistence is untouched.
 */
export function usePlayerPresence(state: PlaybackState) {
  const sessionRef = useRef<{ sessionId: string; key: string } | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const item = state.currentItem;
  const status = state.status;

  async function startSession() {
    const current = item;
    if (!current) return;
    if (!PRESENCE_SUBJECTS.has(current.subject.type)) return;
    const key = `${current.subject.type}:${current.subject.id}:${current.representationId}`;
    if (sessionRef.current?.key === key) return;
    // Item changed → end the previous session explicitly.
    await endSession();
    try {
      const res = await api<{ data: { id: string } }>("/presence/start", {
        method: "POST",
        body: JSON.stringify({
          kind: kindForMedia(current.mediaKind),
          workType: current.subject.type,
          workId: current.subject.id,
          representationId: current.representationId,
          source: "feylore-player",
          metadata: {},
        }),
      });
      sessionRef.current = { sessionId: res.data.id, key };
    } catch {
      // best-effort
    }
  }

  async function endSession() {
    const prev = sessionRef.current;
    sessionRef.current = null;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (prev) {
      try {
        await api("/presence/end", {
          method: "POST",
          body: JSON.stringify({ sessionId: prev.sessionId }),
        });
      } catch {
        // best-effort
      }
    }
  }

  async function touchPaused() {
    const prev = sessionRef.current;
    if (!prev) return;
    try {
      await api("/presence/touch", {
        method: "POST",
        body: JSON.stringify({ sessionId: prev.sessionId, metadata: { paused: true } }),
      });
    } catch {
      // best-effort
    }
  }

  async function heartbeat() {
    const prev = sessionRef.current;
    if (!prev || !item) return;
    const duration = state.durationSeconds ?? undefined;
    const position = state.positionSeconds;
    const progressPercent =
      duration && duration > 0 ? Math.round((position / duration) * 100) : undefined;
    try {
      await api("/presence/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          sessionId: prev.sessionId,
          metadata: {
            ...(progressPercent !== undefined ? { progressPercent } : {}),
            ...(duration && duration > 0
              ? { remainingSeconds: Math.max(0, Math.round(duration - position)) }
              : {}),
          },
        }),
      });
    } catch {
      // best-effort
    }
  }

  // Lifecycle: start on playing/loading with an item; pause touches once;
  // stop/ended with no item ends. Heartbeats run only while playing.
  useEffect(() => {
    if (!item) {
      void endSession();
      return;
    }
    if (status === "playing") {
      void startSession().then(() => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          void heartbeat();
        }, HEARTBEAT_MS);
      });
      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      };
    }
    if (status === "paused") {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      void startSession().then(() => {
        void touchPaused();
      });
      return;
    }
    if (status === "ended" || status === "idle") {
      void endSession();
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.subject.type, item?.subject.id, item?.representationId, status]);

  // Unmount (player close) ends the live session.
  useEffect(() => {
    return () => {
      void endSession();
    };
  }, []);
}
