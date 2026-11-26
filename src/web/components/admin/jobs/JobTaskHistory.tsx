import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { JobRunDetail } from "@shared/api";
import { isJobActive } from "@shared/api";
import { api } from "../../../app/api";
import { Button } from "../../primitives";
import { formatRelativeTime } from "../../../app/pages/admin/format-relative-time";
import { JobStatusBadge } from "./JobStatusBadge";
import styles from "./jobs.module.css";

export function JobTaskHistory({
  type,
  taskKey,
  taskLabel,
  latestId,
  onAction,
}: {
  type: string;
  taskKey: string;
  taskLabel: string;
  latestId: string;
  onAction: () => void;
}) {
  const { t } = useTranslation("admin");
  const [runs, setRuns] = useState<JobRunDetail[] | null>(null);

  useEffect(() => {
    void api<{ data: JobRunDetail[] }>(
      `/jobs?type=${encodeURIComponent(type)}&taskKey=${encodeURIComponent(taskKey)}&limit=50`,
    ).then((res) => setRuns(res.data));
  }, [type, taskKey]);

  if (runs === null) {
    return (
      <div className={styles.historyPanel}>
        <p className={styles.historyLoading}>{t("jobsHistoryLoading")}</p>
      </div>
    );
  }

  return (
    <div className={styles.historyPanel}>
      <p className={styles.historyTitle}>
        {t(`jobsType_${type}`, { defaultValue: type })} · {taskLabel}
      </p>
      <ul className={styles.historyList}>
        {runs.map((run) => (
          <li key={run.id} className={styles.historyItem}>
            <JobStatusBadge status={run.status} />
            <span className={styles.historyTime}>
              {formatRelativeTime(run.updatedAt, t("jobsTimeNever"))}
            </span>
            {run.error && (
              <span className={styles.historyError}>{run.error}</span>
            )}
            {run.id === latestId && run.status === "failed" && (
              <Button
                type="button"
                onClick={() =>
                  void api(`/jobs/${run.id}/retry`, { method: "POST" }).then(
                    () => onAction(),
                  )
                }
              >
                {t("jobsRetry")}
              </Button>
            )}
            {run.id === latestId && isJobActive(run.status) && (
              <Button
                type="button"
                onClick={() =>
                  void api(`/jobs/${run.id}/cancel`, { method: "POST" }).then(
                    () => onAction(),
                  )
                }
              >
                {t("jobsCancel")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
