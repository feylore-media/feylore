import { useTranslation } from "react-i18next";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
} from "@shared/book-metadata-editor";
import { MetadataMatrixFieldRow } from "./MetadataMatrixFieldRow";
import styles from "./metadata-edit.module.css";

export interface MetadataMatrixData {
  providerSources: MetadataEditorSourceColumn[];
  fields: MetadataEditorFieldRow[];
}

interface MetadataMatrixEditorProps {
  data: MetadataMatrixData;
  coverTitle: string;
  sourceLabels: Map<string, string>;
  getFieldValue: (fieldId: string) => string;
  onFieldChange: (fieldId: string, value: string) => void;
  onToggleLock: (fieldId: string) => void;
  onAdopt: (fieldId: string, sourceKey: string, value: string) => void;
  kindOf?: (fieldId: string) => string;
}

export function MetadataMatrixEditor({
  data,
  coverTitle,
  sourceLabels,
  getFieldValue,
  onFieldChange,
  onToggleLock,
  onAdopt,
  kindOf,
}: MetadataMatrixEditorProps) {
  const { t } = useTranslation("books");
  const { providerSources, fields } = data;
  const sourceCount = providerSources.length;

  if (fields.length === 0) {
    return <p className={styles.fetchingNote}>{t("metadataEditorEmpty")}</p>;
  }

  const gridStyle = {
    "--source-count": String(sourceCount),
  } as React.CSSProperties;

  return (
    <div className={styles.matrix}>
      <div className={styles.matrixInner} style={gridStyle}>
        {providerSources.length > 0 && (
          <div className={styles.matrixHeader} style={gridStyle}>
            <div />
            <div />
            <div
              className={styles.matrixHeaderTier}
              style={{ gridColumn: `3 / span ${providerSources.length}` }}
            >
              <span className={styles.matrixHeaderCell}>
                {t("metadataColumnProviders")}
              </span>
            </div>
          </div>
        )}

        <div className={styles.matrixSubHeader} style={gridStyle}>
          <div className={styles.matrixHeaderCell}>{t("metadataColumnField")}</div>
          <div className={`${styles.matrixHeaderCell} ${styles.matrixHeaderFeylore}`}>
            {t("metadataColumnFeylore")}
          </div>
          {providerSources.map((source) => (
            <div key={source.key} className={styles.matrixHeaderCell}>
              {source.label}
            </div>
          ))}
        </div>

        {fields.map((field) => (
          <MetadataMatrixFieldRow
            key={field.id}
            field={field}
            value={getFieldValue(field.id)}
            providerSources={providerSources}
            sourceLabels={sourceLabels}
            coverTitle={coverTitle}
            kindOf={kindOf}
            onChange={(value) => onFieldChange(field.id, value)}
            onToggleLock={() => onToggleLock(field.id)}
            onAdopt={onAdopt}
            gridStyle={gridStyle}
          />
        ))}
      </div>
    </div>
  );
}
