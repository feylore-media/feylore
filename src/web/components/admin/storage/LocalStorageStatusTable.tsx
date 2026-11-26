import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, TextField } from "../../primitives";
import { EmptyState } from "../../states";
import adminStyles from "../../../app/pages/admin/admin.module.css";
import storageStyles from "../../../app/pages/admin/admin-storage.module.css";

export interface StorageLocationHealth {
  exists: boolean;
  readable: boolean;
  writable: boolean;
  error?: string;
}

export interface StorageLocationRow {
  id: string;
  name: string;
  kind: "managed" | "external" | "read_only";
  rootPath: string;
  watchEnabled: boolean;
  health: StorageLocationHealth;
}

function kindLabelKey(kind: StorageLocationRow["kind"]): string {
  switch (kind) {
    case "managed":
      return "storageKindManaged";
    case "external":
      return "storageKindExternal";
    case "read_only":
      return "storageKindReadOnly";
  }
}

function healthLabel(
  health: StorageLocationHealth,
  t: (key: string) => string,
): string {
  if (!health.exists) return t("storageHealthUnavailable");
  if (!health.readable) return t("storageHealthNotReadable");
  if (health.writable) return t("storageHealthHealthyWritable");
  return t("storageHealthHealthyReadOnly");
}

export function LocalStorageStatusTable({
  locations,
  canWrite,
  onPatch,
  onRefresh,
}: {
  locations: StorageLocationRow[] | null;
  canWrite: boolean;
  onPatch: (
    id: string,
    patch: { name?: string; watchEnabled?: boolean },
  ) => Promise<void>;
  onRefresh: () => void;
}) {
  const { t } = useTranslation("admin");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editWatch, setEditWatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (locations === null) {
    return <p className={storageStyles.footnote}>{t("storageLoading")}</p>;
  }

  if (locations.length === 0) {
    return (
      <EmptyState
        ns="admin"
        titleKey="storageNoLocations"
        detailKey="storageNoLocationsDetail"
      />
    );
  }

  function openEdit(loc: StorageLocationRow) {
    setExpandedId(loc.id);
    setEditName(loc.name);
    setEditWatch(loc.watchEnabled);
    setMessage(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setMessage(null);
    try {
      await onPatch(id, { name: editName, watchEnabled: editWatch });
      setMessage(t("storageSaved"));
      onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("storageSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {message ? (
        <p className={storageStyles.notice} role="status">
          {message}
        </p>
      ) : null}
      <div className={adminStyles.adminTableWrap}>
        <table className={adminStyles.adminTable}>
          <thead>
            <tr>
              <th className={storageStyles.colLocation}>{t("storageColName")}</th>
              <th className={storageStyles.colPath}>{t("storageColPath")}</th>
              <th className={storageStyles.colProvider}>{t("storageColKind")}</th>
              <th className={storageStyles.colStatus}>{t("storageColStatus")}</th>
              <th className={storageStyles.colWatch}>{t("storageColWatch")}</th>
              {canWrite ? (
                <th className={storageStyles.colActions}>{t("storageColActions")}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <Fragment key={loc.id}>
                <tr>
                  <td>{loc.name}</td>
                  <td className={storageStyles.monoCell}>{loc.rootPath}</td>
                  <td>{t(kindLabelKey(loc.kind))}</td>
                  <td>{healthLabel(loc.health, t)}</td>
                  <td>
                    {loc.watchEnabled ? t("storageWatchOn") : t("storageWatchOff")}
                  </td>
                  {canWrite ? (
                    <td>
                      <Button type="button" onClick={() => openEdit(loc)}>
                        {expandedId === loc.id ? t("storageClose") : t("storageEdit")}
                      </Button>
                    </td>
                  ) : null}
                </tr>
                {expandedId === loc.id && canWrite ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={storageStyles.editPanel}>
                        <TextField
                          id={`storage-name-${loc.id}`}
                          label={t("storageColName")}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <label className={storageStyles.checkboxRow}>
                          <input
                            type="checkbox"
                            checked={editWatch}
                            onChange={(e) => setEditWatch(e.target.checked)}
                          />
                          {t("storageWatchEnabled")}
                        </label>
                        {loc.health.error ? (
                          <p className={storageStyles.footnote}>{loc.health.error}</p>
                        ) : null}
                        <div className={storageStyles.editActions}>
                          <Button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveEdit(loc.id)}
                          >
                            {t("storageSave")}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => setExpandedId(null)}
                          >
                            {t("storageCancel")}
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
