import { useEffect, useRef } from "react";
import { api } from "../app/api";

interface ReaderPresenceInput {
  workType: string;
  workId: string;
  representationId: string | null;
  /** Current progress percent (0-100) for presence metadata. */
  progressPercent?: number | null;
  chapterTitle?: string | null;
  enabled?: boolean;
}

const TOUCH_THROTTLE_MS = 60_000;

/**
 * Feylore Reader presence producer (Presence 1.0).
 *
 * - open → start/touch reading presence
 * - meaningful interaction → throttled touch (call `touch()` explicitly)
 * - close/unmount → end live session, preserving 48h recent eligibility
 */
export function useReaderPresence(input: ReaderPresenceInput) {
  const { workType, workId, representationId, progressPercent, chapterTitle, enabled = true } = input;
  const sessionIdRef = useRef<string | null>(null);
  const lastTouchRef = useRef(0);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !representationId || !workId) return;
    const key = `${workType}:${workId}:${representationId}`;
    let cancelled = false;

    // One live reading session per open reader. Re-open reuses the key.
    if (keyRef.current === key && sessionIdRef.current) return;
    keyRef.current = key;

    void (async () => {
      try {
        const res = await api<{ data: { id: string } }>("/presence/start", {
          method: "POST",
          body: JSON.stringify({
            kind: "reading",
            workType,
            workId,
            representationId,
            source: "feylore-reader",
            metadata: {
              ...(progressPercent !== undefined && progressPercent !== null
                ? { progressPercent }
                : {}),
              ...(chapterTitle ? { chapterTitle } : {}),
            },
          }),
        });
        if (!cancelled) sessionIdRef.current = res.data.id;
      } catch {
        // Presence is best-effort; reading must work without it.
      }
    })();

    return () => {
      cancelled = true;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      keyRef.current = null;
      if (sessionId) {
        // Clean close ends the live session; recent-reading eligibility
        // (48h since lastEngagedAt) is preserved server-side.
        void api("/presence/end", {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        }).catch(() => undefined);
      }
    };
    // Intentionally keyed on identity only; progress flows through touch().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workType, workId, representationId]);

  async function touch(meta?: { progressPercent?: number | null; chapterTitle?: string | null }) {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
    lastTouchRef.current = now;
    const progress = meta?.progressPercent ?? progressPercent;
    const chapter = meta?.chapterTitle ?? chapterTitle;
    try {
      await api("/presence/touch", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          metadata: {
            ...(progress !== undefined && progress !== null ? { progressPercent: progress } : {}),
            ...(chapter ? { chapterTitle: chapter } : {}),
          },
        }),
      });
    } catch {
      // best-effort
    }
  }

  return { touch };
}
