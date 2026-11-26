import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReaderSettings } from "@shared/settings";
import { api } from "../api";
import { Button, TextField } from "../../components/primitives";
import styles from "./pages.module.css";
import {
  loadTypographyPreferences,
  saveTypographyPreferences,
  DEFAULT_TYPOGRAPHY,
} from "../../reader/preferences/readerPreferences";
import type { TypographyPreferences } from "../../reader/adapter/types";

export function SettingsReaderPage() {
  const { t } = useTranslation("settings");
  const [typography, setTypography] = useState<TypographyPreferences>(
    loadTypographyPreferences,
  );
  const [progressSyncEnabled, setProgressSyncEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api<{ data: ReaderSettings }>("/settings/reader")
      .then((r) => {
        setProgressSyncEnabled(r.data.progressSyncEnabled);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    saveTypographyPreferences(typography);
  }, [typography]);

  async function saveProgressSync(enabled: boolean) {
    setProgressSyncEnabled(enabled);
    await api("/settings/reader", {
      method: "PATCH",
      body: JSON.stringify({ progressSyncEnabled: enabled }),
    });
  }

  return (
    <div>
      <h2>{t("reader")}</h2>
      <p>{t("readerTypographyDeviceLocal")}</p>
      <form className={styles.form}>
        <TextField
          label={t("fontFamily")}
          id="readerFont"
          value={typography.fontFamily ?? DEFAULT_TYPOGRAPHY.fontFamily}
          onChange={(e) =>
            setTypography((p) => ({ ...p, fontFamily: e.target.value }))
          }
        />
        <label htmlFor="readerFontSize">
          {t("fontSize")}: {typography.fontSize ?? DEFAULT_TYPOGRAPHY.fontSize}%
        </label>
        <input
          id="readerFontSize"
          type="range"
          min={80}
          max={200}
          value={typography.fontSize ?? DEFAULT_TYPOGRAPHY.fontSize}
          onChange={(e) =>
            setTypography((p) => ({ ...p, fontSize: Number(e.target.value) }))
          }
        />
        <label htmlFor="readerTheme">{t("theme")}</label>
        <select
          id="readerTheme"
          value={typography.theme ?? DEFAULT_TYPOGRAPHY.theme}
          onChange={(e) =>
            setTypography((p) => ({
              ...p,
              theme: e.target.value as TypographyPreferences["theme"],
            }))
          }
        >
          <option value="light">{t("themeLight")}</option>
          <option value="dark">{t("themeDark")}</option>
          <option value="sepia">{t("themeSepia")}</option>
        </select>
        {loaded && (
          <label>
            <input
              type="checkbox"
              checked={progressSyncEnabled}
              onChange={(e) => void saveProgressSync(e.target.checked)}
            />{" "}
            {t("progressSync")}
          </label>
        )}
        <Button type="button" onClick={() => saveTypographyPreferences(typography)}>
          {t("save")}
        </Button>
      </form>
    </div>
  );
}
