import { useTranslation } from "react-i18next";
import type { MetadataEditorSourceCell } from "@shared/book-metadata-editor";
import { MetadataSourceActionBox } from "./MetadataSourceActionBox";
import styles from "./metadata-edit.module.css";

interface MetadataSourceCellProps {
  cell: MetadataEditorSourceCell;
  onAdopt: () => void;
}

export function MetadataSourceCell({ cell, onAdopt }: MetadataSourceCellProps) {
  const { t } = useTranslation("books");
  const hasValue = cell.value !== null && !cell.gap;

  return (
    <div className={styles.providerCell}>
      {hasValue && (
        <MetadataSourceActionBox
          label={t("metadataAdoptValue")}
          onClick={onAdopt}
        >
          ←
        </MetadataSourceActionBox>
      )}
      {!hasValue && <div className={styles.actionBox} aria-hidden />}
      <span
        className={`${styles.cellValue} ${!hasValue ? styles.cellGap : ""}`}
      >
        {hasValue ? cell.value : cell.gap ? t("metadataGap") : "—"}
      </span>
    </div>
  );
}
