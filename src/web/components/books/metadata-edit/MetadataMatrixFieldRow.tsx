import { useTranslation } from "react-i18next";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
  MetadataEditorSourceCell,
} from "@shared/book-metadata-editor";
import type { CanonicalFieldId } from "@shared/metadata-fields";
import { getBookFieldKind } from "@shared/book-metadata-field-kinds";
import { MetadataSourceActionBox } from "./MetadataSourceActionBox";
import { MetadataSourceCell } from "./MetadataSourceCell";
import { MetadataFieldInput } from "./MetadataFieldInput";
import { MetadataCoverThumbnail } from "./MetadataCoverThumbnail";
import { provenanceDisplayLabel } from "./metadata-provenance";
import styles from "./metadata-edit.module.css";

interface MetadataMatrixFieldRowProps {
  field: MetadataEditorFieldRow;
  value: string;
  providerSources: MetadataEditorSourceColumn[];
  sourceLabels: Map<string, string>;
  coverTitle: string;
  kindOf?: (fieldId: string) => string;
  onChange: (value: string) => void;
  onToggleLock: () => void;
  onAdopt: (fieldId: string, sourceKey: string, value: string) => void;
  gridStyle?: React.CSSProperties;
}

function cellForKey(
  field: MetadataEditorFieldRow,
  key: string,
): MetadataEditorSourceCell {
  return (
    field.sources.find((c) => c.key === key) ?? {
      key,
      value: null,
      gap: true,
    }
  );
}

export function MetadataMatrixFieldRow({
  field,
  value,
  providerSources,
  sourceLabels,
  coverTitle,
  kindOf,
  onChange,
  onToggleLock,
  onAdopt,
  gridStyle,
}: MetadataMatrixFieldRowProps) {
  const { t } = useTranslation("books");
  const provenance = provenanceDisplayLabel(field.provenance, sourceLabels, t);
  const kind = kindOf
    ? kindOf(field.id)
    : getBookFieldKind(field.id as CanonicalFieldId);
  const fieldId = field.id as CanonicalFieldId;

  return (
    <div className={styles.matrixRow} style={gridStyle}>
      <div className={styles.fieldLabel}>{field.label}</div>

      <div className={styles.feyloreCell}>
        <MetadataSourceActionBox
          locked={field.isLocked}
          label={
            field.isLocked ? t("metadataUnlockField") : t("metadataLockField")
          }
          onClick={onToggleLock}
        >
          {field.isLocked ? "🔒" : "○"}
        </MetadataSourceActionBox>
        <div className={styles.feyloreValueBlock}>
          {kind === "cover" ? (
            <MetadataCoverThumbnail
              coverFileId={/^https?:\/\//i.test(value) ? null : value || null}
              coverUrl={/^https?:\/\//i.test(value) ? value : null}
              title={coverTitle}
            />
          ) : (
            <MetadataFieldInput
              fieldId={fieldId}
              fieldLabel={field.label}
              value={value}
              onChange={onChange}
              compact
              kindOf={kindOf}
            />
          )}
          {provenance && (
            <span className={styles.provenanceBadge}>{provenance}</span>
          )}
        </div>
      </div>

      {providerSources.map((column) => {
        const cell = cellForKey(field, column.key);
        if (kind === "cover") {
          const hasCover = !cell.gap && !!cell.value;
          return (
            <div key={column.key} className={styles.providerCell}>
              {hasCover ? (
                <MetadataSourceActionBox
                  label={t("metadataAdoptValue")}
                  onClick={() => {
                    if (cell.value) onAdopt(field.id, column.key, cell.value);
                  }}
                >
                  ←
                </MetadataSourceActionBox>
              ) : (
                <div className={styles.actionBox} aria-hidden />
              )}
              <MetadataCoverThumbnail
                coverFileId={cell.coverFileId}
                coverUrl={cell.coverUrl}
                title={coverTitle}
              />
            </div>
          );
        }
        return (
          <MetadataSourceCell
            key={column.key}
            cell={cell}
            onAdopt={() => {
              if (cell.value) onAdopt(field.id, column.key, cell.value);
            }}
          />
        );
      })}
    </div>
  );
}
