import type { BookMetadataField } from "@shared/books";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { provenanceDisplayLabelFromField } from "../books/metadata-edit/metadata-provenance";
import styles from "./work-detail.module.css";

interface MetadataFieldGridProps {
  fields: BookMetadataField[];
  prominence?: "primary" | "secondary";
}

export function MetadataFieldGrid({
  fields,
  prominence,
}: MetadataFieldGridProps) {
  const { t } = useTranslation("books");
  const filtered = prominence
    ? fields.filter((f) => f.prominence === prominence)
    : fields;
  if (filtered.length === 0) return null;

  return (
    <dl className={styles.metadataPrimary}>
      {filtered.map((field) => {
        const provenance = provenanceDisplayLabelFromField(field.provenance, t);
        return (
          <Fragment key={field.id}>
            <dt>{field.label}</dt>
            <dd>
              <div>{field.value}</div>
              {provenance && (
                <div className={styles.metadataProvenance}>{provenance}</div>
              )}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}
