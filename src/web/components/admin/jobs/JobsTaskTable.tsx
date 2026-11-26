import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import type { JobTaskSummary } from "@shared/api";
import adminStyles from "../../../app/pages/admin/admin.module.css";
import { AdminExpandChevron } from "../../../app/pages/admin/AdminExpandChevron";
import { formatRelativeTime } from "../../../app/pages/admin/format-relative-time";
import { JobStatusBadge } from "./JobStatusBadge";
import { JobTaskHistory } from "./JobTaskHistory";
import styles from "./jobs.module.css";

function taskRowKey(task: JobTaskSummary): string {
  return `${task.type}\0${task.taskKey}`;
}

export function JobsTaskTable({
  tasks,
  loading,
  onAction,
}: {
  tasks: JobTaskSummary[];
  loading: boolean;
  onAction: () => void;
}) {
  const { t } = useTranslation("admin");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (loading && tasks.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <table className={adminStyles.adminTable}>
          <thead>
            <tr>
              <th className={adminStyles.colChevron} aria-hidden />
              <th>{t("jobsColTask")}</th>
              <th>{t("jobsColType")}</th>
              <th>{t("jobsColStatus")}</th>
              <th>{t("jobsColLastRun")}</th>
              <th>{t("jobsColStreak")}</th>
              <th>{t("jobsColError")}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }, (_, i) => (
              <tr key={i} className={styles.skeletonRow}>
                <td colSpan={7}>
                  <div className={styles.skeletonCell} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!loading && tasks.length === 0) {
    return <p className={styles.emptyState}>{t("jobsEmpty")}</p>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={adminStyles.adminTable}>
        <thead>
          <tr>
            <th className={adminStyles.colChevron} aria-hidden />
            <th>{t("jobsColTask")}</th>
            <th>{t("jobsColType")}</th>
            <th>{t("jobsColStatus")}</th>
            <th>{t("jobsColLastRun")}</th>
            <th>{t("jobsColStreak")}</th>
            <th>{t("jobsColError")}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const key = taskRowKey(task);
            const expanded = expandedKey === key;
            const failed = task.latest.status === "failed";

            return (
              <Fragment key={key}>
                <tr
                  className={`${adminStyles.adminRow} ${failed ? styles.rowFailed : ""}`}
                  onClick={() => setExpandedKey(expanded ? null : key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedKey(expanded ? null : key);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={expanded}
                >
                  <td className={adminStyles.colChevron}>
                    <AdminExpandChevron expanded={expanded} />
                  </td>
                  <td>
                    <span className={styles.taskName}>{task.taskLabel}</span>
                    {task.runCount > 1 && (
                      <span className={styles.runCount}>
                        {t("jobsRunCount", { count: task.runCount })}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={styles.typeLabel}>
                      {t(`jobsType_${task.type}`, { defaultValue: task.type })}
                    </span>
                  </td>
                  <td>
                    <JobStatusBadge status={task.latest.status} />
                  </td>
                  <td>
                    {formatRelativeTime(
                      task.latest.updatedAt,
                      t("jobsTimeNever"),
                    )}
                  </td>
                  <td>
                    {task.failureStreak >= 2 ? (
                      <span className={styles.streakKeepsFailing}>
                        {t("jobsKeepsFailing", { count: task.failureStreak })}
                      </span>
                    ) : (
                      <span className={styles.streakNone}>—</span>
                    )}
                  </td>
                  <td className={styles.errorCell}>
                    {task.latest.error ?? "—"}
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <JobTaskHistory
                        type={task.type}
                        taskKey={task.taskKey}
                        taskLabel={task.taskLabel}
                        latestId={task.latest.id}
                        onAction={onAction}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
