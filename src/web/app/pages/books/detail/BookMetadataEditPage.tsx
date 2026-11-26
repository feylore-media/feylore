import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NavBackLink } from "../../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { api } from "../../../api";
import { Button } from "../../../../components/primitives";
import { LoadingState } from "../../../../components/states";
import { MetadataMatrixEditor } from "../../../../components/books/metadata-edit/MetadataMatrixEditor";
import { MetadataProviderFieldsSection } from "../../../../components/books/metadata-edit/MetadataProviderFieldsSection";
import { CustomMetadataFieldsEditor } from "../../../../components/books/metadata-edit/CustomMetadataFieldsEditor";
import { MetadataEditCollapsibleSection } from "../../../../components/books/metadata-edit/MetadataEditCollapsibleSection";
import { useBookMetadataEditor } from "../../../../hooks/books/useBookMetadataEditor";
import { useBookMetadataFetch } from "../../../../hooks/books/useBookMetadataFetch";
import { useBookCustomFieldsEditor } from "../../../../hooks/books/useBookCustomFieldsEditor";
import { bookPath } from "../../../../routes/paths";
import styles from "../../../../components/books/metadata-edit/metadata-edit.module.css";
import bookStyles from "../../../../components/books/books.module.css";
import detailStyles from "../../../../components/work-detail/work-detail.module.css";

export function BookMetadataEditPage() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: editorData,
    loading: editorLoading,
    reload: reloadEditor,
    sourceLabels,
    getFieldValue,
    editFieldValue,
    adoptProviderValue,
    toggleFieldLock,
    save: saveCanonical,
    hasUnsavedChanges: canonicalDirty,
    error: editorError,
  } = useBookMetadataEditor(slug);

  const { status: metadataFetchStatus } = useBookMetadataFetch(slug, {
    onComplete: reloadEditor,
  });

  const {
    fields: customFields,
    loading: customFieldsLoading,
    getFieldValue: getCustomFieldValue,
    editFieldValue: editCustomFieldValue,
    save: saveCustomFields,
    hasUnsavedChanges: customFieldsDirty,
  } = useBookCustomFieldsEditor(slug);

  useEffect(() => {
    if (!slug) return;
    void api<{ data: BookDetail }>(`/books/${slug}`).then((r) => {
      setBook(r.data);
    });
  }, [slug]);

  const hasProviderFields =
    (editorData?.providerSpecificFields.length ?? 0) > 0 &&
    (editorData?.providerSources.length ?? 0) > 0;
  const hasCustomFields = (customFields?.length ?? 0) > 0;
  const hasUnsavedChanges = canonicalDirty || customFieldsDirty;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setSaving(true);
    setError(null);

    try {
      if (canonicalDirty) {
        await saveCanonical();
      }
      if (customFieldsDirty) {
        await saveCustomFields();
      }
      navigate(bookPath(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!slug) return null;
  if (!book || editorLoading || customFieldsLoading) return <LoadingState />;

  const displayError = error ?? editorError;

  return (
    <div className={`${detailStyles.detailWorkspace} ${styles.editorPage}`}>
      <NavBackLink to={bookPath(slug)}>{book.title}</NavBackLink>

      <h1 className={detailStyles.identityTitle}>{t("editMetadataTitle")}</h1>
      <p className={styles.fetchingNote}>{t("metadataEditorHelp")}</p>

      {metadataFetchStatus === "fetching" && (
        <p className={styles.fetchingNote} role="status">
          {t("metadataFetching")}
        </p>
      )}

      {displayError && (
        <div className={bookStyles.errorBanner} role="alert">
          {displayError}
        </div>
      )}

      <form className={styles.editorSection} onSubmit={onSubmit}>
        <MetadataEditCollapsibleSection
          title={t("metadataSectionStandard")}
          defaultOpen
        >
          {editorData ? (
            <MetadataMatrixEditor
              data={editorData}
              coverTitle={book.title}
              sourceLabels={sourceLabels}
              getFieldValue={getFieldValue}
              onFieldChange={editFieldValue}
              onToggleLock={(fieldId) => void toggleFieldLock(fieldId)}
              onAdopt={adoptProviderValue}
            />
          ) : (
            <p className={styles.fetchingNote}>{t("metadataEditorEmpty")}</p>
          )}
        </MetadataEditCollapsibleSection>

        {hasProviderFields && editorData && (
          <MetadataEditCollapsibleSection
            title={t("metadataSectionProviderFields")}
            defaultOpen={hasProviderFields}
          >
            <MetadataProviderFieldsSection data={editorData} />
          </MetadataEditCollapsibleSection>
        )}

        {hasCustomFields && customFields && (
          <MetadataEditCollapsibleSection
            title={t("metadataSectionCustomFields")}
            defaultOpen={hasCustomFields}
          >
            <CustomMetadataFieldsEditor
              fields={customFields}
              getFieldValue={getCustomFieldValue}
              onFieldChange={editCustomFieldValue}
            />
          </MetadataEditCollapsibleSection>
        )}

        <div className={styles.editorActions}>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !hasUnsavedChanges}
          >
            {t("save")}
          </Button>
          <Button type="button" onClick={() => navigate(bookPath(slug))}>
            {t("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
