import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../api";
import { usePermission } from "../../auth-context";
import { AdminPage } from "./AdminPage";
import pageStyles from "../pages.module.css";
import adminStyles from "./admin.module.css";
import storageStyles from "./admin-storage.module.css";
import {
  LocalStorageStatusTable,
  type StorageLocationRow,
} from "../../../components/admin/storage/LocalStorageStatusTable";
import { ExternalStoragePlaceholder } from "../../../components/admin/storage/ExternalStoragePlaceholder";
import { IngestSourcesSection } from "../../../components/admin/storage/IngestSourcesSection";

const UPLOAD_LIMIT_MEDIA_TYPES = [
  {
    id: "books",
    labelKey: "storageMediaBooks",
    descriptionKey: "storageMediaBooksDescription",
    defaultValue: 500,
    defaultUnit: "mb" as const,
  },
  {
    id: "videos",
    labelKey: "storageMediaVideos",
    descriptionKey: "storageMediaVideosDescription",
    defaultValue: 10,
    defaultUnit: "gb" as const,
  },
  {
    id: "podcasts",
    labelKey: "storageMediaPodcasts",
    descriptionKey: "storageMediaPodcastsDescription",
    defaultValue: 2,
    defaultUnit: "gb" as const,
  },
] as const;

type SizeUnit = "mb" | "gb";

interface UploadLimitState {
  value: number;
  unit: SizeUnit;
}

interface UploadLimitsResponse {
  maxUploadBytes: number;
  maxUploadFiles: number;
}

function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

function SizeInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
  id,
  t,
}: {
  value: number;
  unit: SizeUnit;
  onValueChange: (v: number) => void;
  onUnitChange: (u: SizeUnit) => void;
  id: string;
  t: (key: string) => string;
}) {
  return (
    <div className={storageStyles.sizeControl}>
      <input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
        aria-label={t("storageColMaxFileSize")}
      />
      <select
        value={unit}
        onChange={(e) => onUnitChange(e.target.value as SizeUnit)}
        aria-label={t("storageColMaxFileSize")}
      >
        <option value="mb">{t("storageUnitMb")}</option>
        <option value="gb">{t("storageUnitGb")}</option>
      </select>
    </div>
  );
}

export function AdminStoragePage() {
  const { t } = useTranslation("admin");
  const canWriteStorage = usePermission(PERMISSIONS.STORAGE_WRITE);

  const [uploadLimits, setUploadLimits] = useState<
    Record<string, UploadLimitState>
  >(() =>
    Object.fromEntries(
      UPLOAD_LIMIT_MEDIA_TYPES.map((m) => [
        m.id,
        { value: m.defaultValue, unit: m.defaultUnit },
      ]),
    ),
  );

  const [chunkSize, setChunkSize] = useState<UploadLimitState>({
    value: 8,
    unit: "mb",
  });

  const [globalLimits, setGlobalLimits] = useState<UploadLimitsResponse | null>(
    null,
  );
  const [locations, setLocations] = useState<StorageLocationRow[] | null>(null);

  const loadLocations = useCallback(async () => {
    const res = await api<{ data: StorageLocationRow[] }>("/storage/locations");
    setLocations(res.data);
  }, []);

  useEffect(() => {
    void api<{ data: UploadLimitsResponse }>("/ingest/upload-limits")
      .then((res) => setGlobalLimits(res.data))
      .catch(() => setGlobalLimits(null));
  }, []);

  useEffect(() => {
    void loadLocations().catch(() => setLocations([]));
  }, [loadLocations]);

  function updateUploadLimit(id: string, patch: Partial<UploadLimitState>) {
    setUploadLimits((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, ...patch },
    }));
  }

  async function patchLocation(
    id: string,
    patch: { name?: string; watchEnabled?: boolean },
  ) {
    await api(`/storage/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  const storageOptions = (locations ?? []).map((loc) => ({
    id: loc.id,
    name: loc.name,
  }));

  return (
    <AdminPage title={t("storageTitle")} description={t("storageDescription")}>
      <section className={pageStyles.settingsSection}>
        <p className={storageStyles.notice}>{t("storageDockerGuidance")}</p>
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("storageMountedStorage")}</h3>
        <LocalStorageStatusTable
          locations={locations}
          canWrite={canWriteStorage}
          onPatch={patchLocation}
          onRefresh={() => void loadLocations()}
        />
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("ingestSourcesTitle")}</h3>
        <IngestSourcesSection storageLocations={storageOptions} />
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("storageExternalTitle")}</h3>
        <ExternalStoragePlaceholder />
      </section>

      <section className={pageStyles.settingsSection}>
        <h3>{t("storageUploadLimits")}</h3>
        <p className={storageStyles.notice}>{t("storageLimitsNotPersisted")}</p>
        <div className={adminStyles.adminTableWrap}>
          <table className={adminStyles.adminTable}>
            <thead>
              <tr>
                <th className={storageStyles.colMediaType}>
                  {t("storageColMediaType")}
                </th>
                <th className={storageStyles.colMaxSize}>
                  {t("storageColMaxFileSize")}
                </th>
                <th className={adminStyles.colDescription}>
                  {t("storageColDescription")}
                </th>
              </tr>
            </thead>
            <tbody>
              {UPLOAD_LIMIT_MEDIA_TYPES.map((media) => {
                const limit = uploadLimits[media.id]!;
                return (
                  <tr key={media.id}>
                    <td>{t(media.labelKey)}</td>
                    <td>
                      <SizeInput
                        id={`upload-limit-${media.id}`}
                        value={limit.value}
                        unit={limit.unit}
                        onValueChange={(v) =>
                          updateUploadLimit(media.id, { value: v })
                        }
                        onUnitChange={(u) =>
                          updateUploadLimit(media.id, { unit: u })
                        }
                        t={t}
                      />
                    </td>
                    <td className={adminStyles.colDescription}>
                      {t(media.descriptionKey)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {globalLimits && (
          <p className={storageStyles.footnote}>
            {t("storageGlobalUploadLimit", {
              size: formatStorageBytes(globalLimits.maxUploadBytes),
              count: globalLimits.maxUploadFiles,
            })}
          </p>
        )}

        <div className={storageStyles.chunkSizeSection}>
          <label
            className={storageStyles.chunkSizeLabel}
            htmlFor="upload-chunk-size"
          >
            {t("storageUploadChunkSize")}
          </label>
          <p className={storageStyles.chunkSizeHelp}>
            {t("storageUploadChunkSizeHelp")}
          </p>
          <SizeInput
            id="upload-chunk-size"
            value={chunkSize.value}
            unit={chunkSize.unit}
            onValueChange={(v) => setChunkSize((prev) => ({ ...prev, value: v }))}
            onUnitChange={(u) => setChunkSize((prev) => ({ ...prev, unit: u }))}
            t={t}
          />
          <p className={storageStyles.chunkSizeNotice}>
            {t("storageChunkSizeNotPersisted")}
          </p>
        </div>
      </section>
    </AdminPage>
  );
}
