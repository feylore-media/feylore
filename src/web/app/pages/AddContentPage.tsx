import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../api";
import { usePermission } from "../auth-context";
import { UploadPanel } from "../../components/ingest/UploadPanel";
import styles from "../../components/ingest/ingest.module.css";

interface IngestRoot {
  id: string;
  name: string;
  storageLocationId: string;
}

interface StorageLocation {
  id: string;
  name: string;
}

export function AddContentPage() {
  const { t } = useTranslation("ingest");
  const canConfigureIngest = usePermission(PERMISSIONS.INGEST_READ);
  const [roots, setRoots] = useState<IngestRoot[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);

  useEffect(() => {
    void Promise.all([
      api<{ data: IngestRoot[] }>("/ingest/roots"),
      api<{ data: StorageLocation[] }>("/storage/locations"),
    ]).then(([rootsRes, locRes]) => {
      setRoots(rootsRes.data);
      setLocations(locRes.data);
    });
  }, []);

  return (
    <div>
      <h1>{t("addContentTitle")}</h1>

      <section className={styles.addSection}>
        <p className={styles.recommended}>{t("recommended")}</p>
        <h2 className={styles.addSectionTitle}>{t("ingestFilesTitle")}</h2>
        <p className={styles.hint}>{t("ingestFilesDescription")}</p>
        {roots.length === 0 ? (
          <p className={styles.hint}>
            {t("noIngestRoots")}
            {canConfigureIngest ? (
              <>
                {" "}
                <Link to="/admin/library/storage">{t("configureIngest")}</Link>
              </>
            ) : null}
          </p>
        ) : (
          <ul className={styles.settingsList}>
            {roots.map((root) => {
              const loc = locations.find((l) => l.id === root.storageLocationId);
              return (
                <li key={root.id} className={styles.settingsRow}>
                  <p className={styles.settingsRowTitle}>{root.name}</p>
                  <p className={styles.settingsRowMeta}>
                    {loc?.name ?? root.storageLocationId}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.addSection}>
        <h2 className={styles.addSectionTitle}>{t("uploadFilesTitle")}</h2>
        <UploadPanel />
      </section>

      {(canConfigureIngest) && (
        <section className={styles.addSection}>
          <h2 className={styles.addSectionTitle}>{t("manageTitle")}</h2>
          <p className={styles.hint}>
            <Link to="/admin/library/storage">{t("storageSettings")}</Link>
          </p>
        </section>
      )}
    </div>
  );
}
