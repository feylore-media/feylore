import { useTranslation } from "react-i18next";
import type { JobStatus } from "@shared/api";
import styles from "./jobs.module.css";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation("admin");
  const className =
    status === "failed"
      ? styles.statusFailed
      : status === "completed"
        ? styles.statusCompleted
        : status === "running"
          ? styles.statusRunning
          : status === "cancelled"
            ? styles.statusCancelled
            : styles.statusQueued;

  return (
    <span className={`${styles.statusBadge} ${className}`}>
      {t(`jobsStatus_${status}`)}
    </span>
  );
}
