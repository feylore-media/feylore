import { Fragment } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookMetadataField } from "@shared/books";
import {
  FIELD_GROUP_LABELS,
  type MetadataFieldGroup,
} from "@shared/metadata-fields";
import { getBookEditorFieldGroups } from "@shared/book-metadata-field-kinds";
import { useBookDetailContext } from "./BookDetailContext";
import { ManifestationPanel } from "../../../../components/work-detail/ManifestationPanel";
import { MetadataFieldGrid } from "../../../../components/work-detail/MetadataFieldGrid";
import { WorkDetailSection } from "../../../../components/work-detail/WorkDetailSection";
import { bookEditPath } from "../../../../routes/paths";
import { usePermission } from "../../../auth-context";
import { PERMISSIONS } from "@shared/permissions";
import styles from "../../../../components/work-detail/work-detail.module.css";

function fieldsForGroup(
  fields: BookMetadataField[],
  group: MetadataFieldGroup,
): BookMetadataField[] {
  return fields.filter((f) => f.group === group);
}

export function BookMetadataPage() {
  const { t } = useTranslation("books");
  const { book, metadataFetchStatus } = useBookDetailContext();
  const canEdit = usePermission(PERMISSIONS.BOOKS_WRITE);
  const metadataGroups = getBookEditorFieldGroups();

  if (!book) return null;

  const hasAnyMetadata = book.metadataFields.length > 0;

  return (
    <>
      {metadataFetchStatus === "fetching" && (
        <p className={styles.readingStateMeta} role="status">
          {t("metadataFetching")}
        </p>
      )}

      {canEdit && (
        <p>
          <Link to={bookEditPath(book.slug)} className={styles.journalLink}>
            {t("editWorkMetadata")}
          </Link>
        </p>
      )}

      {metadataGroups.map((group) => {
        const groupFields = fieldsForGroup(book.metadataFields, group);
        if (groupFields.length === 0) return null;
        const groupLabel = t(`metadataGroup_${group}`, {
          defaultValue: FIELD_GROUP_LABELS[group],
        });

        return (
          <WorkDetailSection key={group} label={groupLabel} rule>
            <MetadataFieldGrid fields={groupFields} />
          </WorkDetailSection>
        );
      })}

      {!hasAnyMetadata && (
        <WorkDetailSection label={t("details")} rule>
          <p className={styles.journalCounts}>{t("noMetadataFields")}</p>
        </WorkDetailSection>
      )}

      {book.customFields.length > 0 && (
        <WorkDetailSection label={t("customFields")} rule>
          <dl className={styles.metadataSecondary}>
            {book.customFields.map((field) => (
              <Fragment key={field.key}>
                <dt>{field.displayName}</dt>
                <dd>{field.displayValue ?? "—"}</dd>
              </Fragment>
            ))}
          </dl>
        </WorkDetailSection>
      )}

      <ManifestationPanel book={book} />
    </>
  );
}
