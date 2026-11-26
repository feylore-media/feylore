import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api";
import { Button } from "../../../../components/primitives";
import {
  FieldSourceOrderTable,
  type FieldSourceOrderRow,
} from "../../../../components/metadata/FieldSourceOrderTable";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import type { MediaModuleId } from "@shared/media-modules";
import type { MetadataMatchingRules } from "@shared/metadata-settings";
import type { ModuleSettings } from "./useMetadataModuleSettings";

export function MetadataAggregationSection({
  moduleId,
  moduleData,
  message,
  setMessage,
}: {
  moduleId: MediaModuleId;
  moduleData: ModuleSettings;
  message: { type: "ok" | "err"; text: string } | null;
  setMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
}) {
  const { t } = useTranslation("metadata");
  const [sourceOrderFields, setSourceOrderFields] = useState<FieldSourceOrderRow[]>(
    [],
  );
  const [matching, setMatching] = useState<MetadataMatchingRules | null>(null);

  useEffect(() => {
    setSourceOrderFields(moduleData.fieldPriorities.map((p) => ({ ...p })));
    setMatching({ ...moduleData.matchingRules });
  }, [moduleData]);

  const providerName = (key: string) =>
    moduleData.providers.find((p) => p.key === key)?.name ?? key;

  async function saveSourceOrder() {
    await api(`/metadata/settings/${moduleId}/priorities`, {
      method: "PATCH",
      body: JSON.stringify({
        priorities: sourceOrderFields.map((p) => ({
          fieldId: p.fieldId,
          providerSourceOrder: p.providerSourceOrder,
        })),
      }),
    });
    setMessage({ type: "ok", text: t("saveSuccess") });
  }

  async function saveMatching() {
    if (!matching) return;
    await api(`/metadata/settings/${moduleId}/matching`, {
      method: "PATCH",
      body: JSON.stringify(matching),
    });
    setMessage({ type: "ok", text: t("saveSuccess") });
  }

  if (!matching) return null;

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

      <section className={styles.section} aria-labelledby="source-order">
        <h3 id="source-order" className={styles.sectionTitle}>
          {t("sourceOrder")}
        </h3>
        <p className={styles.sectionLead}>{t("sourceOrderHelp")}</p>
        <FieldSourceOrderTable
          fields={sourceOrderFields}
          providerName={providerName}
          onChange={setSourceOrderFields}
        />
        <Button type="button" variant="primary" onClick={() => void saveSourceOrder()}>
          {t("save")}
        </Button>
      </section>

      <section className={styles.section} aria-labelledby="matching-rules">
        <h3 id="matching-rules" className={styles.sectionTitle}>
          {t("matching")}
        </h3>
        <div className={styles.matchingOptions}>
          <label className={styles.matchingOption}>
            <input
              type="checkbox"
              checked={matching.preferIsbnMatching}
              onChange={(e) =>
                setMatching((m) =>
                  m ? { ...m, preferIsbnMatching: e.target.checked } : m,
                )
              }
            />
            {t("preferIsbnMatching")}
          </label>
          <label className={styles.matchingOption}>
            <input
              type="checkbox"
              checked={matching.fillMissingFromLowerPriority}
              onChange={(e) =>
                setMatching((m) =>
                  m
                    ? { ...m, fillMissingFromLowerPriority: e.target.checked }
                    : m,
                )
              }
            />
            {t("fillMissing")}
          </label>
          <label className={styles.matchingOption}>
            <input
              type="checkbox"
              checked={matching.preferExactEditionMatch}
              onChange={(e) =>
                setMatching((m) =>
                  m ? { ...m, preferExactEditionMatch: e.target.checked } : m,
                )
              }
            />
            {t("preferExactEdition")}
          </label>
          <label className={styles.matchingOption}>
            <input type="checkbox" checked disabled />
            {t("respectOverrides")}
          </label>
        </div>
        <Button type="button" variant="primary" onClick={() => void saveMatching()}>
          {t("save")}
        </Button>
      </section>

      <p className={styles.sectionLead}>{t("provenanceNote")}</p>
    </>
  );
}
