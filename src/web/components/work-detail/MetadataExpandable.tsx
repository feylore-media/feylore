import { useTranslation } from "react-i18next";
import type { BookMetadataField } from "@shared/books";
import { MetadataFieldGrid } from "./MetadataFieldGrid";
import styles from "./work-detail.module.css";

interface MetadataExpandableProps {
  fields: BookMetadataField[];
}

export function MetadataExpandable({ fields }: MetadataExpandableProps) {
  const { t } = useTranslation("books");
  const secondary = fields.filter((f) => f.prominence === "secondary");
  if (secondary.length === 0) return null;

  return (
    <details className={styles.metadataMore}>
      <summary>{t("moreMetadata")}</summary>
      <MetadataFieldGrid fields={fields} prominence="secondary" />
    </details>
  );
}
