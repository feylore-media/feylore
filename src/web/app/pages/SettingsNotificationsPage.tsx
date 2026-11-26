import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NOTIFICATION_TYPE_LIST,
  type NotificationSettingsPublic,
} from "@shared/notifications";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
} from "../notifications-api";
import {
  groupNotificationTypesByCategory,
  hasNotificationSettingsChanges,
  notificationCategoryLabel,
  notificationSettingsChanges,
  notificationTypeName,
} from "../../components/account/notification-display";
import { Button } from "../../components/primitives";
import styles from "./pages.module.css";

export function SettingsNotificationsPage() {
  const { t } = useTranslation(["settings", "notifications"]);
  const [loaded, setLoaded] = useState<NotificationSettingsPublic | null>(null);
  const [draft, setDraft] = useState<NotificationSettingsPublic | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNotificationSettings()
      .then((settings) => {
        if (cancelled) return;
        setLoaded(settings);
        setDraft(settings);
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(
          err instanceof Error ? err.message : t("notifications:loadError"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const togglePaused = useCallback(() => {
    setDraft((d) => (d ? { ...d, paused: !d.paused } : d));
    setMessage(null);
  }, []);

  const toggleType = useCallback(
    (key: string) => (field: "enabled" | "emailEnabled") => {
      setDraft((d) => {
        if (!d) return d;
        return {
          ...d,
          preferences: d.preferences.map((p) =>
            p.type === key ? { ...p, [field]: !p[field] } : p,
          ),
        };
      });
      setMessage(null);
    },
    [],
  );

  const save = useCallback(async () => {
    if (!loaded || !draft) return;
    const changes = notificationSettingsChanges(loaded, draft);
    if (changes.preferences === undefined && changes.paused === undefined) return;
    setSaving(true);
    setMessage(null);
    try {
      const settings = await updateNotificationSettings(changes);
      setLoaded(settings);
      setDraft(settings);
      setMessage(t("notifications:preferencesSaved"));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("notifications:preferencesSaveError"),
      );
    } finally {
      setSaving(false);
    }
  }, [loaded, draft, t]);

  const groups = draft
    ? groupNotificationTypesByCategory(NOTIFICATION_TYPE_LIST)
    : [];

  return (
    <div>
      <h2>{t("notifications:title")}</h2>
      <p className={styles.settingsIntro}>{t("notifications:subtitle")}</p>

      {!draft && <p>{t("settings:loading")}</p>}

      {draft && (
        <form className={styles.settingsForm}>
          <section className={styles.settingsPauseCard}>
            <label className={styles.settingsToggle}>
              <input
                type="checkbox"
                checked={draft.paused}
                disabled={saving}
                onChange={togglePaused}
              />{" "}
              {t("notifications:pauseNotifications")}
            </label>
            <p className={styles.settingsHelp}>
              {t("notifications:pauseNotificationsHelp")}
            </p>
          </section>

          {!draft.emailAvailable && (
            <p className={styles.settingsUnavailableNotice} role="status">
              <strong>{t("notifications:emailUnavailableTitle")}</strong>
              <span>{t("notifications:emailUnavailableHelp")}</span>
            </p>
          )}

          {groups.map(([category, definitions]) => (
            <section key={category}>
              <h3 className={styles.settingsGroupTitle}>
                {notificationCategoryLabel(category, t)}
              </h3>
              <ul className={styles.settingsPreferenceList}>
                {definitions.map((def) => {
                  const pref = draft.preferences.find(
                    (p) => p.type === def.key,
                  );
                  return (
                    <li key={def.key} className={styles.settingsPreference}>
                      <div className={styles.settingsPreferenceBody}>
                        <span className={styles.settingsPreferenceName}>
                          {notificationTypeName(def.key, t)}
                        </span>
                        <span className={styles.settingsPreferenceDetail}>
                          {def.description}
                        </span>
                      </div>
                      <div className={styles.settingsPreferenceChannels}>
                        <label className={styles.settingsToggle}>
                          <input
                            type="checkbox"
                            checked={pref?.enabled ?? def.defaultEnabled}
                            disabled={saving}
                            onChange={() => toggleType(def.key)("enabled")}
                          />{" "}
                          {t("notifications:inApp")}
                        </label>
                        <label className={styles.settingsToggle}>
                          <input
                            type="checkbox"
                            checked={pref?.emailEnabled ?? false}
                            disabled={saving || !draft.emailAvailable}
                            onChange={() =>
                              toggleType(def.key)("emailEnabled")
                            }
                          />{" "}
                          {t("notifications:email")}
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <Button
            type="button"
            disabled={
              saving ||
              !loaded ||
              !hasNotificationSettingsChanges(loaded, draft)
            }
            onClick={() => void save()}
          >
            {t("settings:save")}
          </Button>

          {message && (
            <p className={styles.settingsMessage} role="status">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}