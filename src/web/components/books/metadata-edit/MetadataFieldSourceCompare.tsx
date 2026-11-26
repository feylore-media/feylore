import { useTranslation } from "react-i18next";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
} from "@shared/book-metadata-editor";
import { MetadataSourceCell } from "./MetadataSourceCell";
import styles from "./metadata-edit.module.css";

interface MetadataFieldSourceCompareProps {
  field: MetadataEditorFieldRow;
  sourceColumns: MetadataEditorSourceColumn[];
  onAdopt: (fieldId: string, sourceKey: string, value: string) => void;
}

export function MetadataFieldSourceCompare({
  field,
  sourceColumns,
  onAdopt,
}: MetadataFieldSourceCompareProps) {
  const { t } = useTranslation("books");
  const cellByKey = new Map(field.sources.map((c) => [c.key, c]));
  const hasAnyEvidence = field.sources.some((c) => c.value !== null && !c.gap);

  if (sourceColumns.length === 0 || !hasAnyEvidence) {
    return (
      <p className={styles.compareEmpty}>{t("metadataCompareNoEvidence")}</p>
    );
  }

  return (
    <ul className={styles.compareList}>
      {sourceColumns.map((column) => {
        const cell = cellByKey.get(column.key) ?? {
          key: column.key,
          value: null,
          gap: true,
          availability: column.availability,
        };
        return (
          <li key={column.key} className={styles.compareItem}>
            <span className={styles.compareSourceName}>{column.label}</span>
            <MetadataSourceCell
              cell={cell}
              onAdopt={() => {
                if (cell.value) onAdopt(field.id, column.key, cell.value);
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}
