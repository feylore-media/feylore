import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EditionFormatPreference } from "@shared/metadata-edition-preference";
import { EDITION_FORMAT_PREFERENCES } from "@shared/metadata-edition-preference";
import { api } from "../api";
import styles from "./pages.module.css";

type MetadataSettingsResponse = {
  editionFormatPreference: EditionFormatPreference | null;
};

export function SettingsMetadataPage() {
  const { t } = useTranslation("settings");
  const [preference, setPreference] = useState<EditionFormatPreference | "">(
    "",
  );
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<{ data: MetadataSettingsResponse }>("/settings/metadata")
      .then((response) => {
        setPreference(response.data.editionFormatPreference ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function savePreference(next: EditionFormatPreference | "") {
    setPreference(next);
    setMessage(null);
    try {
      await api("/settings/metadata", {
        method: "PATCH",
        body: JSON.stringify({
          editionFormatPreference: next === "" ? null : next,
        }),
      });
      setMessage(t("metadataSaved", { defaultValue: "Metadata settings saved." }));
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t("metadataSaveError", {
              defaultValue: "Could not save metadata settings.",
            }),
      );
    }
  }

  return (
    <div>
      <h2>{t("metadata")}</h2>
      <p>{t("metadataEditionPreferenceHelp")}</p>
      <form className={styles.form}>
        <label htmlFor="edition-format-preference">
          {t("editionFormatPreference")}
        </label>
        <select
          id="edition-format-preference"
          disabled={!loaded}
          value={preference}
          onChange={(e) =>
            void savePreference(
              e.target.value as EditionFormatPreference | "",
            )
          }
        >
          <option value="">{t("editionFormatPreferenceDomainDefault")}</option>
          {EDITION_FORMAT_PREFERENCES.map((value) => (
            <option key={value} value={value}>
              {t(`editionFormatPreference_${value}`)}
            </option>
          ))}
        </select>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}
