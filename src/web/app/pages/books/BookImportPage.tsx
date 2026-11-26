import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BOOK_IMPORT_FILE_LIMIT } from "@shared/books";
import type { JobStatus } from "@shared/api";
import { isJobActive } from "@shared/api";
import { api } from "../../api";
import { useJobPoll } from "../../useJobPoll";
import { Button } from "../../../components/primitives";
import styles from "../../../components/books/books.module.css";

interface StorageLocation {
  id: string;
  name: string;
}

interface FileRow {
  id: string;
  relativePath?: string;
  originalName?: string;
  mediaType: string | null;
  size: number;
}

function fileDisplayName(file: FileRow): string {
  if (file.originalName) return file.originalName;
  if (file.relativePath) return file.relativePath;
  return `${file.id.slice(0, 8)}…`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABEL_KEYS: Record<JobStatus, string> = {
  queued: "jobStatusQueued",
  running: "jobStatusProcessing",
  completed: "jobStatusCompleted",
  failed: "jobStatusFailed",
  cancelled: "jobStatusCancelled",
};

function JobStatusLine({
  operationKey,
  status,
  error,
  logExcerpt,
}: {
  operationKey: string;
  status: JobStatus | null;
  error: string | null;
  logExcerpt: string | null;
}) {
  const { t } = useTranslation("books");
  if (!status) return null;

  return (
    <p className={styles.jobStatus} role="status">
      {t(operationKey)}: {t(STATUS_LABEL_KEYS[status])}
      {status === "completed" && logExcerpt && (
        <span className={styles.cardMeta}> — {logExcerpt}</span>
      )}
      {status === "failed" && error && (
        <span className={styles.cardMeta}> — {error}</span>
      )}
    </p>
  );
}

export function BookImportPage() {
  const { t } = useTranslation("books");
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const atLimit = selected.size >= BOOK_IMPORT_FILE_LIMIT;

  const loadUnassociated = useCallback(async () => {
    const res = await api<{ data: FileRow[] }>("/files/unassociated").catch(
      () => ({ data: [] as FileRow[] }),
    );
    setFiles(res.data);
  }, []);

  const scanJob = useJobPoll(scanJobId, { onComplete: loadUnassociated });
  const importJob = useJobPoll(importJobId, { onComplete: loadUnassociated });

  useEffect(() => {
    void api<{ data: StorageLocation[] }>("/storage/locations").then((r) => {
      setLocations(r.data);
      if (r.data[0]) setLocationId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    void loadUnassociated();
  }, [loadUnassociated]);

  async function runScan() {
    if (!locationId) return;
    const res = await api<{ data: { jobId: string } }>("/storage/scans", {
      method: "POST",
      body: JSON.stringify({ storageLocationId: locationId }),
    });
    setScanJobId(res.data.jobId);
  }

  function toggleFile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < BOOK_IMPORT_FILE_LIMIT) {
        next.add(id);
      }
      return next;
    });
  }

  async function importSelected() {
    if (selected.size === 0) return;
    const res = await api<{ data: { jobId: string } }>("/books/import", {
      method: "POST",
      body: JSON.stringify({ fileIds: [...selected] }),
    });
    setImportJobId(res.data.jobId);
    setSelected(new Set());
  }

  const scanBusy = isJobActive(scanJob.status);
  const importBusy = isJobActive(importJob.status);

  return (
    <div className={styles.managementPage}>
      <h1 className={styles.pageTitle}>{t("importTitle")}</h1>

      <div className={styles.importCallout}>
        <p>{t("importNoUpload")}</p>
        <p>
          {t("importHowItWorks", { max: BOOK_IMPORT_FILE_LIMIT })}
        </p>
      </div>

      <JobStatusLine
        operationKey="jobScan"
        status={scanJob.status}
        error={scanJob.error}
        logExcerpt={scanJob.logExcerpt}
      />
      <JobStatusLine
        operationKey="jobImport"
        status={importJob.status}
        error={importJob.error}
        logExcerpt={importJob.logExcerpt}
      />

      <div className={styles.managementForm}>
        <label htmlFor="storage">{t("storageLocation")}</label>
        <select
          id="storage"
          className={styles.toolbarInput}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Button type="button" onClick={runScan} disabled={scanBusy}>
          {t("importScan")}
        </Button>
      </div>

      {files.length > 0 && (
        <>
          <p className={styles.importCounter}>
            {t("importLimit", {
              count: selected.size,
              max: BOOK_IMPORT_FILE_LIMIT,
            })}
          </p>
          {atLimit && (
            <p className={styles.importLimitWarning} role="status">
              {t("importLimitReached", { max: BOOK_IMPORT_FILE_LIMIT })}
            </p>
          )}
          <ul className={styles.fileList}>
            {files.map((f) => {
              const isSelected = selected.has(f.id);
              const disabled = atLimit && !isSelected;
              return (
                <li key={f.id} className={styles.fileListItem}>
                  <label className={disabled ? styles.fileLabelDisabled : undefined}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleFile(f.id)}
                    />{" "}
                    <span className={styles.fileName}>{fileDisplayName(f)}</span>
                    <span className={styles.cardMeta}>
                      {" "}
                      · {f.mediaType ?? "unknown"} · {formatSize(f.size)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="primary"
            disabled={selected.size === 0 || importBusy}
            onClick={importSelected}
          >
            {t("importAssociate")} ({selected.size})
          </Button>
        </>
      )}
    </div>
  );
}
