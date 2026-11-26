import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AdminPage } from "./AdminPage";
import { JobsSummaryBanner } from "../../../components/admin/jobs/JobsSummaryBanner";
import { JobsTaskTable } from "../../../components/admin/jobs/JobsTaskTable";
import { useJobsTasks } from "../../../components/admin/jobs/useJobsTasks";
import styles from "../../../components/admin/jobs/jobs.module.css";

export function AdminJobsPage() {
  const { t } = useTranslation("admin");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const { response, loading, error, reload } = useJobsTasks(failuresOnly);

  return (
    <AdminPage title={t("jobsTitle")} description={t("jobsDescription")}>
      <p className={styles.ingestNote}>
        {t("jobsIngestNote")}{" "}
        <Link to="/activity/ingest">{t("jobsIngestLink")}</Link>
      </p>

      <JobsSummaryBanner summary={response?.summary ?? null} loading={loading} />

      <div className={styles.jobsToolbar}>
        <span />
        <label className={styles.failuresToggle}>
          <input
            type="checkbox"
            checked={failuresOnly}
            onChange={(e) => setFailuresOnly(e.target.checked)}
          />
          {t("jobsFailuresOnly")}
        </label>
      </div>

      {error && <p className={styles.errorBanner}>{error}</p>}

      <JobsTaskTable
        tasks={response?.data ?? []}
        loading={loading}
        onAction={() => void reload()}
      />
    </AdminPage>
  );
}
