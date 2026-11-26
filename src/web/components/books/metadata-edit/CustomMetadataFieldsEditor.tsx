import { useTranslation } from "react-i18next";
import type { CustomFieldValueDto } from "@shared/custom-metadata-fields";
import styles from "./metadata-edit.module.css";

interface CustomMetadataFieldsEditorProps {
  fields: CustomFieldValueDto[];
  getFieldValue: (key: string) => unknown;
  onFieldChange: (key: string, value: unknown) => void;
}

function formatValueForInput(
  value: unknown,
  type: CustomFieldValueDto["type"],
): string {
  if (value === null || value === undefined) return "";
  if (type === "multi_select" && Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

export function CustomMetadataFieldsEditor({
  fields,
  getFieldValue,
  onFieldChange,
}: CustomMetadataFieldsEditorProps) {
  const { t } = useTranslation("books");

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className={styles.customFieldsEditor}>
      {fields.map((field) => {
        const value = getFieldValue(field.key);
        const inputId = `custom-field-${field.key}`;

        return (
          <div key={field.key} className={styles.customFieldRow}>
            <label className={styles.customFieldLabel} htmlFor={inputId}>
              {field.displayName}
            </label>

            {field.type === "boolean" ? (
              <input
                id={inputId}
                type="checkbox"
                checked={value === true}
                onChange={(e) => onFieldChange(field.key, e.target.checked)}
              />
            ) : field.type === "number" ? (
              <input
                id={inputId}
                className={styles.canonicalInput}
                type="number"
                value={formatValueForInput(value, field.type)}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onFieldChange(
                    field.key,
                    raw === "" ? null : Number(raw),
                  );
                }}
              />
            ) : field.type === "date" ? (
              <input
                id={inputId}
                className={styles.canonicalInput}
                type="date"
                value={formatValueForInput(value, field.type)}
                onChange={(e) =>
                  onFieldChange(field.key, e.target.value || null)
                }
              />
            ) : field.type === "multi_select" ? (
              <input
                id={inputId}
                className={styles.canonicalInput}
                type="text"
                value={formatValueForInput(value, field.type)}
                placeholder={t("metadataCustomFieldMultiPlaceholder")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean);
                  onFieldChange(field.key, parts.length ? parts : null);
                }}
              />
            ) : (
              <input
                id={inputId}
                className={styles.canonicalInput}
                type="text"
                value={formatValueForInput(value, field.type)}
                onChange={(e) =>
                  onFieldChange(field.key, e.target.value || null)
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
