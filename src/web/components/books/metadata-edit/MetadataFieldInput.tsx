import { useTranslation } from "react-i18next";
import type { CanonicalFieldId } from "@shared/metadata-fields";
import { getBookFieldKind } from "@shared/book-metadata-field-kinds";
import styles from "./metadata-edit.module.css";

interface MetadataFieldInputProps {
  fieldId: string;
  fieldLabel: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  kindOf?: (fieldId: string) => string;
}

export function MetadataFieldInput({
  fieldId,
  fieldLabel,
  value,
  onChange,
  compact = false,
  kindOf,
}: MetadataFieldInputProps) {
  const { t } = useTranslation("books");
  const inputId = `metadata-field-${fieldId}`;
  const kind = kindOf
    ? kindOf(fieldId)
    : getBookFieldKind(fieldId as CanonicalFieldId);
  const inputClass = compact ? styles.matrixInput : styles.canonicalInput;
  const textareaClass = compact ? styles.matrixTextarea : styles.canonicalTextarea;

  if (kind === "textarea") {
    return (
      <textarea
        id={inputId}
        className={textareaClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={compact ? 2 : 4}
        aria-label={fieldLabel}
      />
    );
  }

  if (kind === "identifiers") {
    return (
      <textarea
        id={inputId}
        className={textareaClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={compact ? 2 : 4}
        placeholder={t("metadataIdentifiersPlaceholder")}
        aria-label={fieldLabel}
      />
    );
  }

  return (
    <input
      id={inputId}
      className={inputClass}
      type={kind === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={fieldId === "title" || fieldId === "name"}
      aria-label={fieldLabel}
    />
  );
}
