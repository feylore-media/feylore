import { useTranslation } from "react-i18next";
import type { JobsTasksSummary } from "@shared/api";
import styles from "./jobs.module.css";

export function JobsSummaryBanner({
  summary,
  loading,
}: {
  summary: JobsTasksSummary | null;
  loading: boolean;
}) {
  const { t } = useTranslation("admin");

  if (loading && !summary) {
    return (
      <p className={styles.summaryBanner} aria-busy="true">
        <span className={styles.skeletonInline} />
      </p>
    );
  }

  if (!summary) return null;

  const parts: string[] = [];
  if (summary.failedCount > 0) {
    parts.push(
      t("jobsSummaryFailed", { count: summary.failedCount }),
    );
  }
  if (summary.keepsFailingCount > 0) {
    parts.push(
      t("jobsSummaryKeepsFailing", { count: summary.keepsFailingCount }),
    );
  }
  if (parts.length === 0) {
    if (summary.activeCount > 0) {
      parts.push(t("jobsSummaryActive", { count: summary.activeCount }));
    } else {
      parts.push(t("jobsSummaryHealthy"));
    }
  }

  return <p className={styles.summaryBanner}>{parts.join(" · ")}</p>;
}
