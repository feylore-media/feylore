import { useEffect, useRef } from "react";
import type { PlaybackLocator } from "@shared/playback";
import { isPlaybackComplete } from "@shared/playback";
import { api } from "../../app/api";
import type { PlaybackState } from "../context/playbackReducer";

const SYNC_DEBOUNCE_MS = 1500;

let syncEnabledCache: boolean | null = null;

async function isProgressSyncEnabled(): Promise<boolean> {
  if (syncEnabledCache !== null) return syncEnabledCache;
  try {
    const res = await api<{ data: { progressSyncEnabled: boolean } }>(
      "/settings/playback",
    );
    syncEnabledCache = res.data.progressSyncEnabled;
    return syncEnabledCache;
  } catch {
    syncEnabledCache = true;
    return true;
  }
}

type ProgressSnapshot = Pick<
  PlaybackState,
  "currentItem" | "positionSeconds" | "durationSeconds"
>;

function buildLocator(state: ProgressSnapshot): PlaybackLocator | null {
  const item = state.currentItem;
  if (!item) return null;

  const durationSeconds = state.durationSeconds ?? undefined;
  const completed = durationSeconds
    ? isPlaybackComplete(state.positionSeconds, durationSeconds)
    : false;

  return {
    kind: "playback",
    positionSeconds: completed ? 0 : state.positionSeconds,
    durationSeconds,
    completed,
  };
}

function shouldSyncProgress(
  state: Pick<PlaybackState, "currentItem">,
): boolean {
  const item = state.currentItem;
  if (!item) return false;
  if (item.subject.type === "live_tv_channel") return false;
  return true;
}

export async function flushPlaybackProgress(
  state: PlaybackState,
): Promise<void> {
  const item = state.currentItem;
  if (!item) return;
  if (!shouldSyncProgress(state)) return;
  if (!["playing", "paused", "ended"].includes(state.status)) return;

  const enabled = await isProgressSyncEnabled();
  if (!enabled) return;

  const locator = buildLocator(state);
  if (!locator) return;

  try {
    await api("/playback/progress", {
      method: "PUT",
      body: JSON.stringify({
        subjectType: item.subject.type,
        subjectId: item.subject.id,
        representationId: item.representationId,
        locator,
      }),
    });
  } catch {
    // Progress sync failures must not interrupt playback
  }
}

export function usePlaybackProgressSync(state: PlaybackState) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>("");
  const { currentItem, positionSeconds, durationSeconds, status } = state;

  useEffect(() => {
    void isProgressSyncEnabled();
  }, []);

  useEffect(() => {
    const item = currentItem;
    if (!item) return;
    if (!shouldSyncProgress({ currentItem })) return;
    if (!["playing", "paused"].includes(status)) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void (async () => {
        const enabled = await isProgressSyncEnabled();
        if (!enabled) return;

        const locator = buildLocator({
          currentItem,
          positionSeconds,
          durationSeconds,
        });
        if (!locator) return;

        const fingerprint = JSON.stringify({
          subject: item.subject,
          representationId: item.representationId,
          locator,
        });
        if (fingerprint === lastSentRef.current) return;
        lastSentRef.current = fingerprint;

        try {
          await api("/playback/progress", {
            method: "PUT",
            body: JSON.stringify({
              subjectType: item.subject.type,
              subjectId: item.subject.id,
              representationId: item.representationId,
              locator,
            }),
          });
        } catch {
          // Progress sync failures must not interrupt playback
        }
      })();
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentItem, positionSeconds, durationSeconds, status]);
}
