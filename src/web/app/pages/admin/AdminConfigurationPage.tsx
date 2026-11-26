import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermission } from "../../auth-context";
import { PERMISSIONS } from "@shared/permissions";
import type { ApplicationGeneral } from "@shared/application-config";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import styles from "../pages.module.css";

const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
] as const;

const THEME_OPTIONS = [
  { value: "light", labelKey: "configurationThemeLight" },
  { value: "dark", labelKey: "configurationThemeDark" },
  { value: "system", labelKey: "configurationThemeSystem" },
] as const;

interface AuthMethods {
  internal: boolean;
  oidc: boolean;
  recovery: boolean;
  passwordReset?: boolean;
  oidcLabel?: string;
}

interface UploadLimits {
  maxUploadBytes: number;
  maxUploadFiles: number;
}

interface PresencePolicy {
  enabled: boolean;
  readingRecencyHours: number;
  playbackDisconnectMinutes: number;
  pausedPlaybackGraceMinutes: number;
}

export function AdminConfigurationPage() {
  const { t } = useTranslation("admin");
  const canRead = usePermission(PERMISSIONS.SYSTEM_SETTINGS_READ);
  const canWrite = usePermission(PERMISSIONS.SYSTEM_SETTINGS_WRITE);
  const [config, setConfig] = useState<ApplicationGeneral | null>(null);
  const [presence, setPresence] = useState<PresencePolicy | null>(null);
  const [authMethods, setAuthMethods] = useState<AuthMethods | null>(null);
  const [uploadLimits, setUploadLimits] = useState<UploadLimits | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([
      api<{ data: ApplicationGeneral }>("/admin/system/configuration"),
      api<{ data: AuthMethods }>("/auth/methods"),
      api<{ data: UploadLimits }>("/ingest/upload-limits"),
      api<{ data: PresencePolicy }>("/admin/system/presence"),
    ])
      .then(([configRes, methodsRes, limitsRes, presenceRes]) => {
        setConfig(configRes.data);
        setAuthMethods(methodsRes.data);
        setUploadLimits(limitsRes.data);
        setPresence(presenceRes.data);
      })
      .catch(() => setConfig(null));
  }, [canRead]);

  async function save() {
    if (!config || !canWrite) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ data: ApplicationGeneral }>(
        "/admin/system/configuration",
        {
          method: "PATCH",
          body: JSON.stringify(config),
        },
      );
      setConfig(res.data);
      setMessage(t("configurationSaved"));
    } catch {
      setMessage(t("configurationSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function savePresence() {
    if (!presence || !canWrite) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await api<{ data: PresencePolicy }>("/admin/system/presence", {
        method: "PATCH",
        body: JSON.stringify(presence),
      });
      setPresence(res.data);
      setMessage(t("configurationSaved"));
    } catch {
      setMessage(t("configurationSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return <p>{t("configurationPermissionDenied")}</p>;
  }

  if (!config) return <p>{t("configurationLoading")}</p>;

  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t("configurationTitle")}</h2>
      <p className={styles.adminPageDescription}>{t("configurationDescription")}</p>

      <section className={styles.settingsSection}>
        <h3>{t("configurationGeneralTitle")}</h3>
        <div className={styles.formField}>
          <label htmlFor="displayName">{t("configurationDisplayName")}</label>
          <input
            id="displayName"
            type="text"
            value={config.displayName}
            disabled={!canWrite}
            onChange={(e) =>
              setConfig((prev) =>
                prev ? { ...prev, displayName: e.target.value } : prev,
              )
            }
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="defaultLocale">{t("configurationDefaultLocale")}</label>
          <select
            id="defaultLocale"
            value={config.defaultLocale}
            disabled={!canWrite}
            onChange={(e) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      defaultLocale: e.target
                        .value as ApplicationGeneral["defaultLocale"],
                    }
                  : prev,
              )
            }
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor="defaultTheme">{t("configurationDefaultTheme")}</label>
          <select
            id="defaultTheme"
            value={config.defaultTheme}
            disabled={!canWrite}
            onChange={(e) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      defaultTheme: e.target
                        .value as ApplicationGeneral["defaultTheme"],
                    }
                  : prev,
              )
            }
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
        {canWrite && (
          <Button
            type="button"
            variant="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {t("configurationSave")}
          </Button>
        )}
        {message && <p role="status">{message}</p>}
      </section>

      <section className={styles.settingsSection}>
        <h3>{t("presenceTitle", { defaultValue: "Presence" })}</h3>
        <p className={styles.lead}>
          {t("presenceDescription", {
            defaultValue:
              "Native reader/player presence. Reading recency defaults to 48 hours.",
          })}
        </p>
        {presence && (
          <>
            <div className={styles.formField}>
              <label>
                <input
                  type="checkbox"
                  checked={presence.enabled}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setPresence((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))
                  }
                />{" "}
                {t("presenceEnabled", { defaultValue: "Presence enabled" })}
              </label>
            </div>
            <div className={styles.formField}>
              <label htmlFor="presence-reading-recency">
                {t("presenceReadingRecency", { defaultValue: "Reading recency (hours)" })}
              </label>
              <input
                id="presence-reading-recency"
                type="number"
                min={1}
                max={720}
                value={presence.readingRecencyHours}
                disabled={!canWrite}
                onChange={(e) =>
                  setPresence((prev) =>
                    prev ? { ...prev, readingRecencyHours: Number(e.target.value) } : prev,
                  )
                }
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="presence-disconnect">
                {t("presenceDisconnect", { defaultValue: "Playback disconnect timeout (minutes)" })}
              </label>
              <input
                id="presence-disconnect"
                type="number"
                min={1}
                max={60}
                value={presence.playbackDisconnectMinutes}
                disabled={!canWrite}
                onChange={(e) =>
                  setPresence((prev) =>
                    prev ? { ...prev, playbackDisconnectMinutes: Number(e.target.value) } : prev,
                  )
                }
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="presence-paused-grace">
                {t("presencePausedGrace", { defaultValue: "Paused playback grace (minutes)" })}
              </label>
              <input
                id="presence-paused-grace"
                type="number"
                min={1}
                max={120}
                value={presence.pausedPlaybackGraceMinutes}
                disabled={!canWrite}
                onChange={(e) =>
                  setPresence((prev) =>
                    prev ? { ...prev, pausedPlaybackGraceMinutes: Number(e.target.value) } : prev,
                  )
                }
              />
            </div>
            {canWrite && (
              <Button
                type="button"
                variant="primary"
                disabled={saving}
                onClick={() => void savePresence()}
              >
                {t("configurationSave")}
              </Button>
            )}
          </>
        )}
      </section>

      <section className={styles.settingsSection}>
        <h3>{t("configurationEnvironmentTitle")}</h3>
        <p className={styles.lead}>{t("configurationEnvironmentHelp")}</p>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            {t("configurationAuthInternal")}:{" "}
            {authMethods?.internal ? t("configurationEnabled") : t("configurationDisabled")}
          </li>
          <li className={styles.listItem}>
            {t("configurationAuthOidc")}:{" "}
            {authMethods?.oidc
              ? authMethods.oidcLabel ?? t("configurationEnabled")
              : t("configurationDisabled")}
          </li>
          <li className={styles.listItem}>
            {t("configurationAuthRecovery")}:{" "}
            {authMethods?.recovery ? t("configurationEnabled") : t("configurationDisabled")}
          </li>
          <li className={styles.listItem}>
            {t("configurationAuthPasswordReset")}:{" "}
            {authMethods?.passwordReset
              ? t("configurationEnabled")
              : t("configurationDisabled")}
          </li>
          {uploadLimits && (
            <li className={styles.listItem}>
              {t("configurationUploadLimits", {
                maxBytes: Math.round(uploadLimits.maxUploadBytes / (1024 * 1024)),
                maxFiles: uploadLimits.maxUploadFiles,
              })}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
