import { useTranslation } from "react-i18next";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
} from "@shared/book-metadata-editor";
import {
  getBookFieldKind,
  identifiersToInputText,
} from "@shared/book-metadata-field-kinds";
import { MetadataSourceActionBox } from "./MetadataSourceActionBox";
import { MetadataFieldSourceCompare } from "./MetadataFieldSourceCompare";
import { provenanceDisplayLabel } from "./metadata-provenance";
import styles from "./metadata-edit.module.css";

interface MetadataCanonicalFieldRowProps {
  field: MetadataEditorFieldRow;
  value: string;
  sourceColumns: MetadataEditorSourceColumn[];
  sourceLabels: Map<string, string>;
  onChange: (value: string) => void;
  onToggleLock: () => void;
  onAdopt: (fieldId: string, sourceKey: string, value: string) => void;
}

export function MetadataCanonicalFieldRow({
  field,
  value,
  sourceColumns,
  sourceLabels,
  onChange,
  onToggleLock,
  onAdopt,
}: MetadataCanonicalFieldRowProps) {
  const { t } = useTranslation("books");
  const provenance = provenanceDisplayLabel(field.provenance, sourceLabels, t);
  const inputId = `metadata-field-${field.id}`;
  const kind = getBookFieldKind(field.id);

  return (
    <div className={styles.canonicalFieldRow}>
      <div className={styles.canonicalFieldHeader}>
        <label className={styles.canonicalFieldLabel} htmlFor={inputId}>
          {field.label}
        </label>
        <MetadataSourceActionBox
          locked={field.isLocked}
          label={
            field.isLocked ? t("metadataUnlockField") : t("metadataLockField")
          }
          onClick={onToggleLock}
        >
          {field.isLocked ? "🔒" : "○"}
        </MetadataSourceActionBox>
      </div>

      {kind === "cover" ? (
        <p className={styles.canonicalCoverRef} id={inputId}>
          {value ? t("metadataCoverReference", { fileId: value }) : "—"}
        </p>
      ) : kind === "textarea" ? (
        <textarea
          id={inputId}
          className={styles.canonicalTextarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      ) : kind === "identifiers" ? (
        <>
          <textarea
            id={inputId}
            className={styles.canonicalTextarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder={t("metadataIdentifiersPlaceholder")}
          />
          <p className={styles.canonicalFieldHelp}>{t("metadataIdentifiersHelp")}</p>
        </>
      ) : (
        <input
          id={inputId}
          className={styles.canonicalInput}
          type={kind === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.id === "title"}
        />
      )}

      {provenance && (
        <span className={styles.provenanceBadge}>{provenance}</span>
      )}

      {sourceColumns.length > 0 && kind !== "cover" && (
        <details className={styles.compareDetails}>
          <summary>{t("metadataCompareSources")}</summary>
          <MetadataFieldSourceCompare
            field={field}
            sourceColumns={sourceColumns}
            onAdopt={onAdopt}
          />
        </details>
      )}
    </div>
  );
}

export function formatEditorFieldValue(
  fieldId: string,
  rawValue: unknown,
): string {
  if (rawValue === undefined || rawValue === null) return "";
  if (getBookFieldKind(fieldId) === "identifiers") {
    return identifiersToInputText(rawValue);
  }
  if (Array.isArray(rawValue)) {
    return rawValue.map(String).join(", ");
  }
  return String(rawValue);
}
