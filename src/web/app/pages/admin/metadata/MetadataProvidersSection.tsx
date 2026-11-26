import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api";
import { Button, TextField } from "../../../../components/primitives";
import { SegmentedControl } from "../../../../components/ui/SegmentedControl";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import type { MediaModuleId } from "@shared/media-modules";
import type { MetadataPersistence } from "@shared/metadata-settings";
import type { ModuleSettings } from "./useMetadataModuleSettings";

const PERSISTENCE_OPTIONS: MetadataPersistence[] = [
  "write_to_file",
  "write_to_sidecar",
  "neither",
];

export function MetadataProvidersSection({
  moduleId,
  moduleData,
  message,
  setMessage,
  onReload,
}: {
  moduleId: MediaModuleId;
  moduleData: ModuleSettings;
  message: { type: "ok" | "err"; text: string } | null;
  setMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation("metadata");
  const [configuringKey, setConfiguringKey] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
  const [persistence, setPersistence] = useState<MetadataPersistence>(
    moduleData.metadataPersistence,
  );
  const [savingPersistence, setSavingPersistence] = useState(false);

  useEffect(() => {
    setPersistence(moduleData.metadataPersistence);
  }, [moduleData.metadataPersistence]);

  const persistenceOptions = PERSISTENCE_OPTIONS.map((value) => ({
    value,
    label: t(`metadataPersistence_${value}`),
    description: t(`metadataPersistence_${value}_description`),
  }));

  async function savePersistence(value: MetadataPersistence) {
    setSavingPersistence(true);
    try {
      await api(`/metadata/settings/${moduleId}/metadata-persistence`, {
        method: "PATCH",
        body: JSON.stringify({ persistence: value }),
      });
      setPersistence(value);
      await onReload();
      setMessage({ type: "ok", text: t("saveSuccess") });
    } catch {
      setMessage({ type: "err", text: t("saveError") });
    } finally {
      setSavingPersistence(false);
    }
  }

  async function toggleProvider(key: string, enabled: boolean) {
    await api(`/metadata/providers/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await onReload();
  }

  async function saveProviderConfig(key: string) {
    const config: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(configDraft)) {
      if (v) config[k] = v;
    }
    await api(`/metadata/providers/${key}`, {
      method: "PATCH",
      body: JSON.stringify({ config }),
    });
    setConfiguringKey(null);
    setConfigDraft({});
    await onReload();
    setMessage({ type: "ok", text: t("saveSuccess") });
  }

  async function testConnection(key: string) {
    const res = await api<{ data: { ok: boolean; message?: string } }>(
      `/metadata/providers/${key}/test`,
      { method: "POST" },
    );
    setMessage({
      type: res.data.ok ? "ok" : "err",
      text: res.data.message ?? (res.data.ok ? t("connection.connected") : t("saveError")),
    });
    await onReload();
  }

  return (
    <>
      {message && (
        <p
          className={
            message.type === "ok" ? styles.messageSuccess : styles.messageError
          }
          role="status"
        >
          {message.text}
        </p>
      )}

      <section className={styles.section} aria-labelledby="metadata-file-metadata">
        <h3 id="metadata-file-metadata" className={styles.sectionTitle}>
          {t("fileMetadata")}
        </h3>
        <p className={styles.sectionLead}>{t("fileMetadataHelp")}</p>
        <div className={styles.persistenceBlock}>
          <p className={styles.generalBlockTitle}>{t("metadataPersistence")}</p>
          <SegmentedControl
            name={`metadataPersistence-${moduleId}`}
            value={persistence}
            options={persistenceOptions}
            onChange={(value) => void savePersistence(value)}
            aria-label={t("metadataPersistence")}
          />
          {savingPersistence && (
            <p className={styles.sectionLead} role="status">
              {t("saving")}
            </p>
          )}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="metadata-sources">
        <h3 id="metadata-sources" className={styles.sectionTitle}>
          {t("sources")}
        </h3>
        <ul className={styles.sourceList}>
          {moduleData.providers.map((source) => {
            const isConfiguring = configuringKey === source.key;
            return (
              <li key={source.key} className={styles.sourceItem}>
                <div className={styles.sourceItemHeader}>
                  <div className={styles.sourceItemInfo}>
                    <p className={styles.sourceName}>{source.name}</p>
                    <p className={styles.sourceMeta}>
                      <span className={styles.badge}>
                        {t(`sourceType.${source.sourceType}`, {
                          defaultValue: source.sourceType,
                        })}
                      </span>
                      {" · "}
                      {t("fieldsCount", { count: source.fields.length })}
                      {source.region && ` · ${source.region.label}`}
                    </p>
                    <p className={styles.sourceStatus}>
                      <span
                        className={
                          source.connectionStatus === "connected"
                            ? styles.statusOk
                            : source.availabilityStatus === "connection_error"
                              ? styles.statusError
                              : styles.statusWarn
                        }
                      >
                        {t(`availability.${source.availabilityStatus}`, {
                          defaultValue: source.availabilityStatus,
                        })}
                        {source.connectionStatus !== "unknown" &&
                          ` · ${t(`connection.${source.connectionStatus}`)}`}
                      </span>
                    </p>
                  </div>
                  <div className={styles.sourceItemControls}>
                    <label>
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        disabled={!source.implemented}
                        onChange={(e) =>
                          void toggleProvider(source.key, e.target.checked)
                        }
                      />
                      {t("enableSource")}
                    </label>
                    {source.configSchema && source.configSchema.length > 0 && (
                      <button
                        type="button"
                        className={
                          isConfiguring
                            ? styles.configureLinkActive
                            : styles.configureLink
                        }
                        aria-expanded={isConfiguring}
                        onClick={() => {
                          setConfiguringKey(isConfiguring ? null : source.key);
                          setConfigDraft({});
                        }}
                      >
                        {t("configure")}
                      </button>
                    )}
                  </div>
                </div>
                {isConfiguring && source.configSchema && (
                  <div className={styles.sourceConfigDisclosure}>
                    <div className={styles.sourceConfigFields}>
                      {source.configSchema.map((field) => (
                        <TextField
                          key={field.key}
                          id={`config-${source.key}-${field.key}`}
                          label={field.label}
                          type={field.type === "secret" ? "password" : "text"}
                          value={configDraft[field.key] ?? ""}
                          onChange={(e) =>
                            setConfigDraft((d) => ({
                              ...d,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder={
                            source.configured && field.type === "secret"
                              ? "••••••••"
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    <div className={styles.sourceConfigActions}>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void saveProviderConfig(source.key)}
                      >
                        {t("save")}
                      </Button>
                      {source.implemented && (
                        <Button
                          type="button"
                          onClick={() => void testConnection(source.key)}
                        >
                          {t("testConnection")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        onClick={() => {
                          setConfiguringKey(null);
                          setConfigDraft({});
                        }}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                    <details className={styles.sourceCapabilities}>
                      <summary>{t("capabilities")}</summary>
                      <ul>
                        {source.fields.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
