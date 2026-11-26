import { useTranslation } from "react-i18next";
import type {
  BookMetadataEditorData,
  MetadataEditorProviderFieldRow,
} from "@shared/book-metadata-editor";
import styles from "./metadata-edit.module.css";

interface MetadataProviderFieldsSectionProps {
  data: BookMetadataEditorData;
}

function ProviderFieldRow({
  field,
  providerSources,
  gridStyle,
}: {
  field: MetadataEditorProviderFieldRow;
  providerSources: BookMetadataEditorData["providerSources"];
  gridStyle: React.CSSProperties;
}) {
  const { t } = useTranslation("books");
  const cellByKey = new Map(field.sources.map((c) => [c.key, c]));

  return (
    <div className={styles.providerMatrixRow} style={gridStyle}>
      <div className={styles.fieldLabel}>
        {field.providerLabel} — {field.label}
      </div>
      {providerSources.map((column) => {
        const cell = cellByKey.get(column.key);
        const hasValue = cell?.value !== null && cell?.value !== undefined && !cell.gap;
        return (
          <div key={column.key} className={styles.providerCell}>
            <span
              className={`${styles.cellValue} ${!hasValue ? styles.cellGap : ""}`}
            >
              {hasValue ? cell!.value : t("metadataGap")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MetadataProviderFieldsSection({
  data,
}: MetadataProviderFieldsSectionProps) {
  const { t } = useTranslation("books");
  const { providerSources, providerSpecificFields } = data;

  if (providerSpecificFields.length === 0 || providerSources.length === 0) {
    return null;
  }

  const gridStyle = {
    "--source-count": String(providerSources.length),
  } as React.CSSProperties;

  return (
    <div className={styles.matrix}>
      <div className={styles.matrixInner} style={gridStyle}>
        <div className={styles.providerMatrixHeader} style={gridStyle}>
          <div className={styles.matrixHeaderCell}>{t("metadataColumnField")}</div>
          {providerSources.map((source) => (
            <div key={source.key} className={styles.matrixHeaderCell}>
              {source.label}
            </div>
          ))}
        </div>

        {providerSpecificFields.map((field) => (
          <ProviderFieldRow
            key={field.key}
            field={field}
            providerSources={providerSources}
            gridStyle={gridStyle}
          />
        ))}
      </div>
    </div>
  );
}
