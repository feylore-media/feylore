import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../../app/api";
import { Button } from "../primitives";
import styles from "./ingest.module.css";

interface UploadLimits {
  maxUploadBytes: number;
  maxUploadFiles: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function UploadPanel() {
  const { t } = useTranslation("ingest");
  const inputRef = useRef<HTMLInputElement>(null);
  const [limits, setLimits] = useState<UploadLimits | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadLimits = useCallback(async () => {
    if (limits) return;
    const res = await api<{ data: UploadLimits }>("/ingest/upload-limits");
    setLimits(res.data);
  }, [limits]);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    setDone(false);
    try {
      await loadLimits();
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
      }
      await api("/ingest/upload", { method: "POST", body: form });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.uploadPanel}>
      <p className={styles.hint}>{t("uploadHint")}</p>
      {limits && (
        <p className={styles.limits}>
          {t("uploadLimits", {
            files: limits.maxUploadFiles,
            size: formatBytes(limits.maxUploadBytes),
          })}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.fileInput}
        onChange={(e) => void handleUpload(e.target.files)}
      />
      <Button
        type="button"
        disabled={uploading}
        onClick={() => {
          void loadLimits();
          inputRef.current?.click();
        }}
      >
        {uploading ? t("uploading") : t("selectFiles")}
      </Button>
      {done && (
        <p className={styles.success} role="status">
          {t("uploadQueued")}{" "}
          <Link to="/activity/ingest">{t("viewActivity")}</Link>
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
