import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PERMISSIONS } from "@shared/permissions";
import { usePermission } from "../../../auth-context";
import styles from "../../../../components/metadata/metadata-settings.module.css";
import { FormattingLanguageSection } from "../../../../components/metadata/formatting/FormattingLanguageSection";
import { FormattingVocabularySection } from "../../../../components/metadata/formatting/FormattingVocabularySection";
import { CustomFieldsSection } from "../../../../components/metadata/formatting/CustomFieldsSection";

const FORMATTING_TABS = [
  "formattingLanguage",
  "formattingGenres",
  "formattingTags",
  "formattingCustomFields",
] as const;

type FormattingTab = (typeof FORMATTING_TABS)[number];

export function MetadataFormattingPage() {
  const { t } = useTranslation("admin");
  const canRead = usePermission(PERMISSIONS.METADATA_FORMATTING_READ);
  const [activeTab, setActiveTab] = useState<FormattingTab>("formattingLanguage");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  if (!canRead) {
    return <p>{t("formattingPermissionRequired")}</p>;
  }

  return (
    <div className={styles.metadataPage}>
      <h2>{t("metadataFormatting")}</h2>
      <p className={styles.sectionLead}>{t("metadataFormattingDescription")}</p>
      <nav className={styles.moduleTabs} aria-label={t("metadataFormatting")}>
        {FORMATTING_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={
              activeTab === tab ? styles.moduleTabActive : styles.moduleTab
            }
            onClick={() => {
              setActiveTab(tab);
              setMessage(null);
            }}
          >
            {t(tab)}
          </button>
        ))}
      </nav>
      {activeTab === "formattingLanguage" && (
        <FormattingLanguageSection message={message} setMessage={setMessage} />
      )}
      {activeTab === "formattingGenres" && (
        <FormattingVocabularySection
          kind="genre"
          message={message}
          setMessage={setMessage}
        />
      )}
      {activeTab === "formattingTags" && (
        <FormattingVocabularySection
          kind="tag"
          message={message}
          setMessage={setMessage}
        />
      )}
      {activeTab === "formattingCustomFields" && (
        <CustomFieldsSection message={message} setMessage={setMessage} />
      )}
    </div>
  );
}
