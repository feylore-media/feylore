import { Navigate, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { api } from "../../../api";
import { LoadingState } from "../../../../components/states";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import { MetadataModuleTabs } from "./MetadataModuleTabs";
import type { MediaModuleId } from "@shared/media-modules";

const BASE_PATH = "/admin/metadata/aggregation";

export function MetadataAggregationLayout() {
  const { t } = useTranslation(["metadata", "admin"]);
  const { moduleId } = useParams();
  const [enabledModules, setEnabledModules] = useState<
    MediaModuleId[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    api<{ data: { enabledModules: MediaModuleId[] } }>(
      "/metadata/enabled-modules",
    )
      .then((res) => setEnabledModules(res.data.enabledModules))
      .catch((err: Error) => {
        setEnabledModules([]);
        setLoadError(err.message);
      });
  }, []);

  if (enabledModules === null) return <LoadingState />;

  if (loadError) {
    return (
      <div className={styles.metadataPage}>
        <h2>{t("admin:metadataAggregation")}</h2>
        <p className={styles.messageError} role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (enabledModules.length === 0) {
    return (
      <div className={styles.metadataPage}>
        <h2>{t("admin:metadataAggregation")}</h2>
        <p className={styles.sectionLead}>{t("metadata:noModules")}</p>
      </div>
    );
  }

  const activeModule =
    moduleId && enabledModules.includes(moduleId as MediaModuleId)
      ? (moduleId as MediaModuleId)
      : enabledModules[0];

  if (!moduleId || moduleId !== activeModule) {
    return <Navigate to={`${BASE_PATH}/${activeModule}`} replace />;
  }

  return (
    <div className={styles.metadataPage}>
      <h2>{t("admin:metadataAggregation")}</h2>
      <p className={styles.sectionLead}>{t("admin:metadataAggregationDescription")}</p>
      <MetadataModuleTabs
        enabledModules={enabledModules}
        basePath={BASE_PATH}
        activeModuleId={activeModule}
      />
      <Outlet context={{ moduleId: activeModule }} />
    </div>
  );
}
