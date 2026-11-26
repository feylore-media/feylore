import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import { MetadataMatrixEditor } from "../../../components/books/metadata-edit/MetadataMatrixEditor";
import { MetadataEditCollapsibleSection } from "../../../components/books/metadata-edit/MetadataEditCollapsibleSection";
import { getPersonFieldKind } from "@shared/person-metadata-field-kinds";
import type { CanonicalFieldId } from "@shared/metadata-fields";
import { usePersonMetadataEditor } from "../../../hooks/people/usePersonMetadataEditor";
import { usePersonMetadataFetch } from "../../../hooks/people/usePersonMetadataFetch";
import { PeopleEditIdentitySections } from "../../../components/people/PeopleEditIdentitySections";
import { peopleEntityPath } from "../../../routes/paths";
import styles from "../../../components/books/metadata-edit/metadata-edit.module.css";
import detailStyles from "../../../components/work-detail/work-detail.module.css";

export function PeopleEditPage() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
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
  } = usePersonMetadataEditor(slug);

  const { status: metadataFetchStatus } = usePersonMetadataFetch(slug, {
    onComplete: reloadEditor,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      if (canonicalDirty) {
        await saveCanonical();
      }
      navigate(peopleEntityPath(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!slug) return null;
  if (editorLoading) return <LoadingState />;

  const displayError = error ?? editorError;

  return (
    <div className={`${detailStyles.detailWorkspace} ${styles.editorPage}`}>
      <NavBackLink to={peopleEntityPath(slug)}>{editorData?.person.name}</NavBackLink>

      <h1 className={detailStyles.identityTitle}>{t("editMetadataTitle")}</h1>
      <p className={styles.fetchingNote}>{t("metadataEditorHelp")}</p>

      {metadataFetchStatus === "fetching" && (
        <p className={styles.fetchingNote} role="status">
          {t("metadataFetching")}
        </p>
      )}

      {displayError && (
        <div className={styles.fetchingNote} role="alert">
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
              coverTitle={editorData.person.name}
              sourceLabels={sourceLabels}
              getFieldValue={getFieldValue}
              onFieldChange={editFieldValue}
              onToggleLock={(fieldId) => void toggleFieldLock(fieldId)}
              onAdopt={adoptProviderValue}
              kindOf={(fieldId) => getPersonFieldKind(fieldId as CanonicalFieldId)}
            />
          ) : (
            <p className={styles.fetchingNote}>{t("metadataEditorEmpty")}</p>
          )}
        </MetadataEditCollapsibleSection>

        <div className={styles.editorActions}>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !canonicalDirty}
          >
            {t("save")}
          </Button>
          <Button type="button" onClick={() => navigate(peopleEntityPath(slug))}>
            {t("cancel")}
          </Button>
        </div>
      </form>

      {editorData && (
        <PeopleEditIdentitySections
          slug={slug}
          person={editorData.person}
          links={editorData.links}
          linkCandidates={editorData.linkCandidates}
          identifiers={editorData.identifiers}
          identifierCandidates={editorData.identifierCandidates}
          providers={editorData.providers}
          onChanged={reloadEditor}
        />
      )}
    </div>
  );
}
