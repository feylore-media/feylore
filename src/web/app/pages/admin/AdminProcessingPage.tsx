import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PERMISSIONS } from "@shared/permissions";
import type { ModuleProcessingPolicy, ProcessingModuleId } from "@shared/processing-policy";
import { api } from "../../api";
import { usePermission } from "../../auth-context";
import { AdminPage } from "./AdminPage";
import {
  ProcessingModuleCard,
  type ProcessingModuleView,
} from "../../../components/admin/processing/ProcessingModuleCard";
import styles from "../../../components/admin/processing/admin-processing.module.css";

export function AdminProcessingPage() {
  const { t } = useTranslation("admin");
  const canRead = usePermission(PERMISSIONS.SYSTEM_SETTINGS_READ);
  const canWrite = usePermission(PERMISSIONS.SYSTEM_SETTINGS_WRITE);
  const [modules, setModules] = useState<ProcessingModuleView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ data: ProcessingModuleView[] }>(
      "/processing/policies",
    );
    setModules(res.data);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load().catch(() => setError(t("processingLoadError")));
  }, [canRead, load, t]);

  async function saveModule(
    moduleId: ProcessingModuleId,
    policy: ModuleProcessingPolicy,
  ) {
    await api(`/processing/policies/${moduleId}`, {
      method: "PATCH",
      body: JSON.stringify(policy),
    });
    await load();
  }

  if (!canRead) {
    return <p>{t("processingPermissionRequired")}</p>;
  }

  if (error) return <p>{error}</p>;
  if (modules === null) return <p>{t("processingLoading")}</p>;

  return (
    <AdminPage
      title={t("processingTitle")}
      description={t("processingDescription")}
    >
      <div className={styles.processingPage}>
        <p className={styles.callout}>{t("processingStagingLifecycle")}</p>
        <div className={styles.moduleList}>
          {modules.map((mod) => (
            <ProcessingModuleCard
              key={mod.moduleId}
              module={mod}
              canWrite={canWrite}
              onSave={saveModule}
            />
          ))}
        </div>
        <p className={styles.footerLink}>
          <Link to="/admin/jobs">{t("processingViewJobs")}</Link>
        </p>
      </div>
    </AdminPage>
  );
}
