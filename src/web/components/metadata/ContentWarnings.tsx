import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContentWarning } from "@shared/content-warnings";
import { contentWarningSchema } from "@shared/content-warnings";

const contentWarningCodes = contentWarningSchema.shape.code.options;
export function ContentWarnings({
  warnings,
  sources = {},
}: {
  warnings: ContentWarning[];
  sources?: Record<string, string>;
}) {
  const { t } = useTranslation("metadata");
  const [revealed, setRevealed] = useState(false);
  if (!warnings.length) return null;
  return (
    <section>
      <button
        type="button"
        aria-expanded={revealed}
        onClick={() => setRevealed(!revealed)}
      >
        {t(revealed ? "warningsHide" : "warningsAvailable")}
      </button>
      {revealed && (
        <>
          <p>{t("warningsProvenanceNotice")}</p>
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>
                {t(`warning_${warning.code}`)} -{" "}
                {warning.provenance.source === "provider"
                  ? t("warningsProvider")
                  : t("warningsUser", {
                      name:
                        sources[warning.provenance.sourceId ?? ""] ??
                        t("warningsUserUnknown"),
                    })}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function ContentWarningPicker({
  value,
  onChange,
}: {
  value: ContentWarning["code"][];
  onChange: (value: ContentWarning["code"][]) => void;
}) {
  const { t } = useTranslation("metadata");
  return (
    <fieldset>
      <legend>{t("warningsOptional")}</legend>
      {contentWarningCodes.map((code) => (
        <label key={code} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={value.includes(code)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, code]
                  : value.filter((item) => item !== code),
              )
            }
          />
          {t(`warning_${code}`)}
        </label>
      ))}
    </fieldset>
  );
}
