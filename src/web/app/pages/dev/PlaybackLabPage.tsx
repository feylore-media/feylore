import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlaybackManifest } from "@shared/playback";
import { api } from "../../api";
import { usePlayback } from "../../../playback/context/PlaybackContext";

interface ProgressResponse {
  data: {
    locator: {
      kind: "playback";
      positionSeconds: number;
      durationSeconds?: number;
      completed?: boolean;
    };
    representationId: string | null;
    updatedAt: string;
  } | null;
}

interface HistoryRow {
  id: string;
  subjectType: string;
  subjectId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export function PlaybackLabPage() {
  const { t } = useTranslation("playback");
  const { playManifest, state } = usePlayback();
  const [representationId, setRepresentationId] = useState("");
  const [manifest, setManifest] = useState<PlaybackManifest | null>(null);
  const [progress, setProgress] = useState<ProgressResponse["data"]>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadAndPlay() {
    setError(null);
    try {
      const manifestRes = await api<{ data: PlaybackManifest }>(
        `/representations/${representationId.trim()}/playback`,
      );
      setManifest(manifestRes.data);
      await playManifest(manifestRes.data);

      const progressRes = await api<ProgressResponse>(
        `/playback/progress?subjectType=${encodeURIComponent(manifestRes.data.subject.type)}&subjectId=${encodeURIComponent(manifestRes.data.subject.id)}`,
      );
      setProgress(progressRes.data);

      const historyRes = await api<{ data: HistoryRow[] }>("/playback/history");
      setHistory(historyRes.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errorLoadingManifest"),
      );
    }
  }

  return (
    <section>
      <h1>{t("labTitle")}</h1>
      <p>{t("labDescription")}</p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <label htmlFor="rep-id">{t("representationId")}</label>
        <input
          id="rep-id"
          value={representationId}
          onChange={(e) => setRepresentationId(e.target.value)}
          style={{ flex: 1, maxWidth: "28rem" }}
        />
        <button type="button" onClick={() => void loadAndPlay()}>
          {t("loadAndPlay")}
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}

      {manifest ? (
        <pre style={{ marginTop: "1rem", overflow: "auto" }}>
          {JSON.stringify(manifest, null, 2)}
        </pre>
      ) : null}

      <h2 style={{ marginTop: "1.5rem" }}>{t("savedProgress")}</h2>
      {progress ? (
        <pre>{JSON.stringify(progress, null, 2)}</pre>
      ) : (
        <p>{t("noProgress")}</p>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>{t("history")}</h2>
      {history.length > 0 ? (
        <ul>
          {history.map((row) => (
            <li key={row.id}>
              {row.eventType} — {row.subjectType}/{row.subjectId} —{" "}
              {row.occurredAt}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noHistory")}</p>
      )}

      {state.currentItem ? (
        <p style={{ marginTop: "1rem" }}>
          Local: {state.status} @ {Math.floor(state.positionSeconds)}s
        </p>
      ) : null}
    </section>
  );
}
