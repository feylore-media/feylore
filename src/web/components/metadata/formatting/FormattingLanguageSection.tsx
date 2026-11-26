import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageRepresentation, MetadataFormattingSettings } from "@shared/metadata-formatting";
import { PERMISSIONS } from "@shared/permissions";
import { api } from "../../../app/api";
import { usePermission } from "../../../app/auth-context";
import { Button } from "../../primitives";
import styles from "../metadata-settings.module.css";
import fmtStyles from "./formatting.module.css";

export function FormattingLanguageSection({
  message,
  setMessage,
}: {
  message: { type: "ok" | "err"; text: string } | null;
  setMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
}) {
  const { t } = useTranslation("admin");
  const canWrite = usePermission(PERMISSIONS.METADATA_FORMATTING_WRITE);
  const [settings, setSettings] = useState<MetadataFormattingSettings | null>(null);
  const [draft, setDraft] = useState<LanguageRepresentation>("simple");

  useEffect(() => {
    void api<{ data: MetadataFormattingSettings }>("/metadata/formatting/settings")
      .then((res) => {
        setSettings(res.data);
        setDraft(res.data.languageRepresentation);
      })
      .catch(() => setMessage({ type: "err", text: t("formattingLoadError") }));
  }, [setMessage, t]);

  async function save() {
    if (!canWrite) return;
    try {
      const res = await api<{ data: MetadataFormattingSettings }>(
        "/metadata/formatting/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ languageRepresentation: draft }),
        },
      );
      setSettings(res.data);
      setMessage({ type: "ok", text: t("formattingSaveSuccess") });
    } catch {
      setMessage({ type: "err", text: t("formattingSaveError") });
    }
  }

  if (!settings) return <p>{t("formattingLoading")}</p>;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("formattingLanguageTitle")}</h3>
      <p className={styles.sectionLead}>{t("formattingLanguageDescription")}</p>
      {message && (
        <p
          className={
            message.type === "ok" ? fmtStyles.messageSuccess : fmtStyles.messageError
          }
          role="status"
        >
          {message.text}
        </p>
      )}
      <fieldset className={fmtStyles.languageOptions}>
        <legend className="sr-only">{t("formattingLanguageRepresentation")}</legend>
        {(["simple", "locale"] as const).map((mode) => (
          <label
            key={mode}
            className={`${fmtStyles.languageOption} ${
              draft === mode ? fmtStyles.languageOptionSelected : ""
            }`}
          >
            <input
              type="radio"
              name="languageRepresentation"
              value={mode}
              checked={draft === mode}
              disabled={!canWrite}
              onChange={() => setDraft(mode)}
            />
            <span>
              <strong>{t(`formattingLanguageMode_${mode}`)}</strong>
              <p className={fmtStyles.languageExample}>
                {t(`formattingLanguageMode_${mode}Example`)}
              </p>
            </span>
          </label>
        ))}
      </fieldset>
      {canWrite && (
        <Button type="button" onClick={() => void save()}>
          {t("formattingSave")}
        </Button>
      )}
    </section>
  );
}
