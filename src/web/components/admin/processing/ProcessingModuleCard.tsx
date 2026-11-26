import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ModuleProcessingPolicy, ProcessingModuleId } from "@shared/processing-policy";
import {
  COMMON_PATH_PRESETS,
  COMMON_TITLE_PRESETS,
} from "@shared/processing-policy";
import {
  renderPathTemplate,
  renderTitleTemplate,
  SAMPLE_METADATA,
  type ProcessingTemplateMetadata,
} from "@shared/processing-templates";
import { Button } from "../../../components/primitives";
import { CommonTemplatesHelper } from "../../../components/admin/processing/CommonTemplatesHelper";
import styles from "./admin-processing.module.css";

export interface ProcessingModuleView {
  moduleId: ProcessingModuleId;
  name: string;
  policy: ModuleProcessingPolicy;
  templateFields: readonly string[];
  destination: {
    intent: string;
    status: string;
    displayPath: string | null;
    storageLocationId: string | null;
  };
  archiveDestination: {
    displayPath: string | null;
    status: string;
  } | null;
  capabilities: {
    ingestAvailable: boolean;
    conversionAvailable: boolean;
    archiveAvailable: boolean;
    readAlongAvailable: boolean;
  };
}

function conversionLabel(policy: ModuleProcessingPolicy): string {
  if (!policy.conversion.enabled || !policy.conversion.target) return "None";
  return policy.conversion.target === "epub-3.3" ? "EPUB 3.3" : policy.conversion.target;
}

function previewMetadata(
  moduleId: ProcessingModuleId,
): ProcessingTemplateMetadata {
  return SAMPLE_METADATA[moduleId];
}

export function ProcessingModuleCard({
  module: initial,
  canWrite,
  onSave,
}: {
  module: ProcessingModuleView;
  canWrite: boolean;
  onSave: (moduleId: ProcessingModuleId, policy: ModuleProcessingPolicy) => Promise<void>;
}) {
  const { t } = useTranslation("admin");
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<ModuleProcessingPolicy>(initial.policy);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!expanded) setDraft(initial.policy);
  }, [initial.policy, expanded]);

  const titlePreview = useMemo(
    () =>
      renderTitleTemplate(
        draft.titleTemplate,
        previewMetadata(initial.moduleId),
        initial.moduleId,
        initial.moduleId === "books" ? "epub" : "cbz",
      ),
    [draft.titleTemplate, initial.moduleId],
  );

  const pathPreview = useMemo(() => {
    const dir = renderPathTemplate(
      draft.pathTemplate,
      previewMetadata(initial.moduleId),
      initial.moduleId,
    );
    const dest = initial.destination.displayPath;
    if (dest && dir) return `${dest}/${dir}`;
    if (dest) return dest;
    return dir;
  }, [draft.pathTemplate, initial.destination.displayPath, initial.moduleId]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(initial.moduleId, draft);
      setExpanded(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={styles.moduleCard}>
      <div className={styles.moduleSummary}>
        <div className={styles.moduleSummaryMain}>
          <h3 className={styles.moduleTitle}>{initial.name}</h3>
          <dl className={styles.summaryGrid}>
            <dt className={styles.summaryLabel}>{t("processingDestination")}</dt>
            <dd className={styles.summaryValue}>
              {initial.destination.displayPath ?? t("processingDestinationUnresolved")}
            </dd>
            <dt className={styles.summaryLabel}>{t("processingMetadata")}</dt>
            <dd className={styles.summaryValue}>
              {draft.metadataProcessingEnabled ? t("processingEnabled") : t("processingDisabled")}
            </dd>
            <dt className={styles.summaryLabel}>{t("processingTitleField")}</dt>
            <dd className={styles.summaryValue}>{draft.titleTemplate}</dd>
            <dt className={styles.summaryLabel}>{t("processingPath")}</dt>
            <dd className={styles.summaryValue}>{draft.pathTemplate}</dd>
            <dt className={styles.summaryLabel}>{t("processingConversion")}</dt>
            <dd className={styles.summaryValue}>{conversionLabel(draft)}</dd>
            {initial.moduleId === "books" && (
              <>
                <dt className={styles.summaryLabel}>{t("processingReadAlong")}</dt>
                <dd className={styles.summaryValue}>
                  {draft.readAlong?.enabled ? t("processingEnabled") : t("processingDisabled")}
                </dd>
              </>
            )}
            <dt className={styles.summaryLabel}>{t("processingOriginals")}</dt>
            <dd className={styles.summaryValue}>
              {draft.originalRetention.enabled ? t("processingEnabled") : t("processingOff")}
            </dd>
          </dl>
        </div>
        <button
          type="button"
          className={styles.configureButton}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t("processingCollapse") : t("processingConfigure")}
        </button>
      </div>

      {expanded && (
        <div className={styles.moduleEditor}>
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingDestination")}</h4>
            {initial.destination.displayPath ? (
              <>
                <p className={styles.previewBox}>{initial.destination.displayPath}</p>
                <p className={styles.helperText}>{t("processingDestinationAuto")}</p>
              </>
            ) : (
              <>
                <p className={styles.unavailable}>{t("processingDestinationUnresolvedDetail")}</p>
                <Link to="/admin/library/storage" className={styles.linkButton}>
                  {t("processingConfigureStorage")}
                </Link>
              </>
            )}
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingMetadata")}</h4>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={draft.metadataProcessingEnabled}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, metadataProcessingEnabled: e.target.checked }))
                }
              />
              {t("processingMetadataDuringIngest")}
            </label>
            <p className={styles.helperText}>{t("processingMetadataHelp")}</p>
            <Link to="/admin/metadata/providers" className={styles.linkButton}>
              {t("processingConfigureMetadata")}
            </Link>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingTitleField")}</h4>
            <label className={styles.fieldLabel}>
              <input
                className={styles.textInput}
                value={draft.titleTemplate}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, titleTemplate: e.target.value }))
                }
              />
            </label>
            <CommonTemplatesHelper
              presets={COMMON_TITLE_PRESETS[initial.moduleId]}
              onSelect={(value) =>
                setDraft((d) => ({ ...d, titleTemplate: value }))
              }
            />
            <p className={styles.helperText}>{t("processingTitlePreview")}</p>
            <p className={styles.previewBox}>{titlePreview}</p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingPath")}</h4>
            <label className={styles.fieldLabel}>
              <input
                className={styles.textInput}
                value={draft.pathTemplate}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, pathTemplate: e.target.value }))
                }
              />
            </label>
            <CommonTemplatesHelper
              presets={COMMON_PATH_PRESETS[initial.moduleId]}
              onSelect={(value) =>
                setDraft((d) => ({ ...d, pathTemplate: value }))
              }
              label={t("processingCommonPathTemplates")}
            />
            <p className={styles.helperText}>{t("processingPathFoldersHelp")}</p>
            <p className={styles.previewBox}>{pathPreview}</p>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingFileOperations")}</h4>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={draft.fileOperations.renameFiles}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    fileOperations: {
                      ...d.fileOperations,
                      renameFiles: e.target.checked,
                    },
                  }))
                }
              />
              {t("processingRenameFiles")}
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={draft.fileOperations.organizeIntoLibrary}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    fileOperations: {
                      ...d.fileOperations,
                      organizeIntoLibrary: e.target.checked,
                    },
                  }))
                }
              />
              {t("processingOrganizeIntoLibrary")}
            </label>
          </section>

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingConversion")}</h4>
            {initial.capabilities.conversionAvailable ? (
              <>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={draft.conversion.enabled}
                    disabled={!canWrite}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        conversion: {
                          enabled: e.target.checked,
                          target: e.target.checked ? "epub-3.3" : null,
                        },
                      }))
                    }
                  />
                  {t("processingConvertDuringProcessing")}
                </label>
                {draft.conversion.enabled && (
                  <p className={styles.helperText}>EPUB 3.3</p>
                )}
                <Link to="/admin/conversion" className={styles.linkButton}>
                  {t("processingConfigureConversions")}
                </Link>
              </>
            ) : (
              <p className={styles.unavailable}>{t("processingConversionUnavailable")}</p>
            )}
          </section>

          {initial.moduleId === "books" && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{t("processingReadAlong")}</h4>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={draft.readAlong?.enabled ?? false}
                  disabled={!canWrite || !initial.capabilities.readAlongAvailable}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      readAlong: { enabled: e.target.checked },
                    }))
                  }
                />
                {t("processingCreateReadAlong")}
              </label>
              <p className={styles.helperText}>{t("processingReadAlongHelp")}</p>
              {!initial.capabilities.readAlongAvailable && (
                <p className={styles.unavailable}>{t("processingReadAlongUnavailable")}</p>
              )}
            </section>
          )}

          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>{t("processingOriginals")}</h4>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={draft.originalRetention.enabled}
                disabled={!canWrite}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    originalRetention: {
                      ...d.originalRetention,
                      enabled: e.target.checked,
                      archiveDestinationIntent: e.target.checked
                        ? d.originalRetention.archiveDestinationIntent ?? "archive"
                        : null,
                    },
                  }))
                }
              />
              {t("processingKeepOriginalFiles")}
            </label>
            {draft.originalRetention.enabled && (
              <>
                <p className={styles.helperText}>
                  {t("processingArchiveFormat")}: tar.gz
                </p>
                {initial.archiveDestination?.displayPath ? (
                  <>
                    <p className={styles.previewBox}>
                      {initial.archiveDestination.displayPath}
                    </p>
                    <p className={styles.helperText}>{t("processingDestinationAuto")}</p>
                  </>
                ) : (
                  <p className={styles.unavailable}>
                    {initial.capabilities.archiveAvailable
                      ? t("processingArchiveDestinationUnresolved")
                      : t("processingArchiveUnavailable")}
                  </p>
                )}
                <p className={styles.helperText}>{t("processingOriginalsHelp")}</p>
              </>
            )}
          </section>

          {canWrite && (
            <div className={styles.actions}>
              <Button
                variant="default"
                onClick={() => {
                  setDraft(initial.policy);
                  setExpanded(false);
                }}
                disabled={saving}
              >
                {t("processingCancel")}
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? t("processingSaving") : t("processingSave")}
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
