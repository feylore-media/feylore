import { useTranslation } from "react-i18next";
import type { DownloadPublic } from "@shared/downloads";
import { Button } from "../../components/primitives";
import { EmptyState, LoadingState } from "../../components/states";
import { useDownloads } from "../../downloads/useDownloads";
import styles from "./pages.module.css";

function formatSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressPercent(d: DownloadPublic, activeProgress: Record<string, number>): number | null {
  const downloaded = activeProgress[d.id] ?? d.bytesDownloaded;
  if (d.bytesTotal == null || downloaded == null || d.bytesTotal === 0) return null;
  return Math.min(100, Math.round((downloaded / d.bytesTotal) * 100));
}

function DownloadRow({
  download,
  activeProgress,
  onRemove,
  onRetry,
}: {
  download: DownloadPublic;
  activeProgress: Record<string, number>;
  onRemove: (id: string) => void;
  onRetry: (d: DownloadPublic) => void;
}) {
  const { t } = useTranslation("downloads");
  const title =
    download.title ??
    (download.format ? download.format.toUpperCase() : t("unknownTitle"));
  const percent = progressPercent(download, activeProgress);

  let statusLabel = t("statusQueued");
  if (download.status === "in_progress") statusLabel = t("statusDownloading");
  if (download.status === "available") statusLabel = t("statusAvailable");
  if (download.status === "failed") statusLabel = t("statusFailed");

  return (
    <li className={styles.listItem}>
      <div>
        <strong>{title}</strong>
        {download.format && download.title && (
          <span className={styles.lead}> · {download.format.toUpperCase()}</span>
        )}
      </div>
      <p className={styles.lead}>
        {statusLabel}
        {formatSize(download.bytesTotal) && ` · ${formatSize(download.bytesTotal)}`}
        {percent != null && ` · ${t("progress", { percent })}`}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        {download.status === "failed" && (
          <Button type="button" onClick={() => onRetry(download)}>
            {t("retry")}
          </Button>
        )}
        {download.status !== "in_progress" && download.status !== "queued" && (
          <Button type="button" onClick={() => onRemove(download.id)}>
            {t("remove")}
          </Button>
        )}
      </div>
    </li>
  );
}

function DownloadSection({
  title,
  items,
  activeProgress,
  onRemove,
  onRetry,
}: {
  title: string;
  items: DownloadPublic[];
  activeProgress: Record<string, number>;
  onRemove: (id: string) => void;
  onRetry: (d: DownloadPublic) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <h2>{title}</h2>
      <ul className={styles.list}>
        {items.map((d) => (
          <DownloadRow
            key={d.id}
            download={d}
            activeProgress={activeProgress}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        ))}
      </ul>
    </section>
  );
}

export function DownloadsPage() {
  const { t } = useTranslation("downloads");
  const {
    grouped,
    loading,
    activeProgress,
    removeDownload,
    startDownload,
  } = useDownloads();

  if (loading) return <LoadingState />;

  const hasAny =
    grouped.active.length +
      grouped.queued.length +
      grouped.available.length +
      grouped.failed.length >
    0;

  if (!hasAny) {
    return (
      <div className={styles.page}>
        <h1>{t("title")}</h1>
        <EmptyState
          titleKey="emptyTitle"
          detailKey="emptyDetail"
          ns="downloads"
        />
      </div>
    );
  }

  async function handleRetry(d: DownloadPublic) {
    await removeDownload(d.id);
    await startDownload(
      d.fileId,
      d.representationId ?? d.preparePayload?.representationId ?? undefined,
    );
  }

  return (
    <div className={styles.page}>
      <h1>{t("title")}</h1>
      <DownloadSection
        title={t("sectionActive")}
        items={grouped.active}
        activeProgress={activeProgress}
        onRemove={removeDownload}
        onRetry={handleRetry}
      />
      <DownloadSection
        title={t("sectionQueued")}
        items={grouped.queued}
        activeProgress={activeProgress}
        onRemove={removeDownload}
        onRetry={handleRetry}
      />
      <DownloadSection
        title={t("sectionAvailable")}
        items={grouped.available}
        activeProgress={activeProgress}
        onRemove={removeDownload}
        onRetry={handleRetry}
      />
      <DownloadSection
        title={t("sectionFailed")}
        items={grouped.failed}
        activeProgress={activeProgress}
        onRemove={removeDownload}
        onRetry={handleRetry}
      />
    </div>
  );
}
