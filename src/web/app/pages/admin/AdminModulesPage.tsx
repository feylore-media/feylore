import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermission } from "../../auth-context";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import styles from "../pages.module.css";

interface ModuleRow {
  id: string;
  name: string;
  enabled: boolean;
  kind?: "media" | "feature";
}

export function AdminModulesPage() {
  const { t } = useTranslation(["admin", "settings", "metadata"]);
  const canRead = usePermission(PERMISSIONS.SYSTEM_SETTINGS_READ);
  const canWrite = usePermission(PERMISSIONS.SYSTEM_SETTINGS_WRITE);
  const [modules, setModules] = useState<ModuleRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void api<{ data: ModuleRow[] }>("/admin/system/modules")
      .then((res) => setModules(res.data))
      .catch(() => setModules([]));
  }, [canRead]);

  async function persistModules(next: ModuleRow[]) {
    if (!canWrite) return;
    setSaving(true);
    setMessage(null);
    try {
      const enabled = next.filter((m) => m.enabled).map((m) => m.id);
      await api("/admin/system/modules", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setMessage(
        t("settings:modulesSaved", { defaultValue: "Modules updated." }),
      );
    } catch {
      setMessage(
        t("settings:modulesSaveError", {
          defaultValue: "Could not save modules.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!modules || !canWrite) return;
    await persistModules(modules);
  }

  function toggleModule(id: string, enabled: boolean) {
    setModules((prev) => {
      if (!prev) return prev;
      const next = prev.map((m) => (m.id === id ? { ...m, enabled } : m));
      if (canWrite) void persistModules(next);
      return next;
    });
  }

  if (!canRead) {
    return (
      <p>{t("admin:modules")} settings require system settings permission.</p>
    );
  }

  if (modules === null) return <p>Loading…</p>;

  const mediaModules = modules.filter((m) => m.kind !== "feature");
  const featureModules = modules.filter((m) => m.kind === "feature");

  return (
    <div>
      <h2>{t("admin:modules")}</h2>
      <h3>{t("metadata:generalModulesTitle")}</h3>
      <p className={styles.lead}>{t("metadata:generalModulesHelp")}</p>
      {canWrite && (
        <p className={styles.lead}>
          {t("settings:modulesAutoSave", {
            defaultValue: "Changes are saved when you toggle a module.",
          })}
        </p>
      )}
      <ul className={styles.list}>
        {mediaModules.map((mod) => (
          <li key={mod.id} className={styles.listItem}>
            <label>
              <input
                type="checkbox"
                checked={mod.enabled}
                disabled={!canWrite}
                onChange={(e) => toggleModule(mod.id, e.target.checked)}
              />{" "}
              {t(`metadata:modules.${mod.id}`, { defaultValue: mod.name })}
            </label>
          </li>
        ))}
      </ul>
      {featureModules.length > 0 && (
        <>
          <h3>{t("metadata:featureModulesTitle")}</h3>
          <p className={styles.lead}>{t("metadata:featureModulesHelp")}</p>
          <ul className={styles.list}>
            {featureModules.map((mod) => (
              <li key={mod.id} className={styles.listItem}>
                <label>
                  <input
                    type="checkbox"
                    checked={mod.enabled}
                    disabled={!canWrite}
                    onChange={(e) => toggleModule(mod.id, e.target.checked)}
                  />{" "}
                  {t(`metadata:modules.${mod.id}`, { defaultValue: mod.name })}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {canWrite && (
        <Button
          type="button"
          variant="primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {t("settings:save")}
        </Button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
