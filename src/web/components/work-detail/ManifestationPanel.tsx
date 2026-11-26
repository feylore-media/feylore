import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BookDetail, PhysicalHoldingPublic } from "@shared/books";
import { usePermission } from "../../app/auth-context";
import { PERMISSIONS } from "@shared/permissions";
import { Link } from "react-router";
import { bookEditPath } from "../../routes/paths";
import { api } from "../../app/api";
import { Button } from "../primitives";
import { WorkDetailSection } from "./WorkDetailSection";
import styles from "./work-detail.module.css";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ManifestationPanelProps {
  book: BookDetail;
}

export function ManifestationPanel({ book }: ManifestationPanelProps) {
  const { t } = useTranslation("books");
  const canEdit = usePermission(PERMISSIONS.BOOKS_WRITE);
  const [holding, setHolding] = useState<PhysicalHoldingPublic | null>(
    book.physicalHolding,
  );
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyTarget, setIdentifyTarget] = useState("");

  useEffect(() => {
    setHolding(book.physicalHolding);
    setIdentifying(false);
    setIdentifyTarget("");
    setActionError(null);
  }, [book.slug, book.physicalHolding]);

  if (book.representations.length === 0 && !holding && !canEdit) return null;

  const repsByManifestation = new Map(
    book.representations.map((rep) => [rep.manifestationId, rep]),
  );

  async function markOwned() {
    setPending(true);
    setActionError(null);
    try {
      const res = await api<{ data: PhysicalHoldingPublic }>(
        `/books/${book.slug}/physical-holding`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setHolding(res.data);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setPending(false);
    }
  }

  async function identify() {
    if (!identifyTarget) return;
    setPending(true);
    setActionError(null);
    try {
      const res = await api<{ data: PhysicalHoldingPublic }>(
        `/books/${book.slug}/physical-holding`,
        {
          method: "PATCH",
          body: JSON.stringify({ manifestationId: identifyTarget }),
        },
      );
      setHolding(res.data);
      setIdentifying(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setPending(false);
    }
  }

  async function removeOwnership() {
    setPending(true);
    setActionError(null);
    try {
      await api(`/books/${book.slug}/physical-holding`, { method: "DELETE" });
      setHolding(null);
      setIdentifying(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setPending(false);
    }
  }

  const heldManifestation = holding?.manifestationId
    ? (book.manifestations.find((m) => m.id === holding.manifestationId) ??
      null)
    : null;
  const holdingSummary = holding
    ? heldManifestation
      ? [
          heldManifestation.label,
          heldManifestation.externalId
            ? `${heldManifestation.externalIdType ?? "ID"}: ${heldManifestation.externalId}`
            : null,
          t("owned"),
        ]
          .filter(Boolean)
          .join(" · ")
      : `${t("physicalCopy")} · ${t("editionUnknown")} · ${t("owned")}`
    : null;

  return (
    <WorkDetailSection label={t("manifestationsLabel")} rule>
      <div className={styles.manifestationGroup}>
        {book.manifestations.map((manifestation) => {
          const rep = repsByManifestation.get(manifestation.id);
          const contentFile =
            rep?.files.find((f) => f.role === "content") ?? rep?.files[0];
          const caps = rep?.capabilities;
          const tech = rep?.technical;

          const compactParts: string[] = [];
          if (caps?.epubVersion) compactParts.push(`EPUB ${caps.epubVersion}`);
          if (caps?.mediaOverlays) compactParts.push(t("mediaOverlays"));
          if (contentFile) compactParts.push(formatSize(contentFile.size));

          return (
            <div key={manifestation.id} className={styles.manifestationRow}>
              <div className={styles.manifestationHeader}>
                <span className={styles.manifestationFormat}>
                  {rep?.format.toUpperCase() ?? "—"}
                </span>
                {manifestation.label && (
                  <span className={styles.manifestationLabel}>
                    {manifestation.label}
                  </span>
                )}
                {manifestation.externalId && (
                  <span className={styles.manifestationLabel}>
                    {manifestation.externalIdType ?? "ID"}:{" "}
                    {manifestation.externalId}
                  </span>
                )}
                {canEdit && (
                  <div className={styles.curatorMenu}>
                    <Link
                      to={bookEditPath(book.slug)}
                      className={styles.journalLink}
                    >
                      {t("editWorkMetadata")}
                    </Link>
                  </div>
                )}
              </div>

              {compactParts.length > 0 && (
                <p className={styles.readingStateMeta}>
                  {compactParts.join(" · ")}
                </p>
              )}

              {(caps?.epubVersion || caps?.mediaOverlays) && (
                <div className={styles.capabilityChips}>
                  {caps.epubVersion && (
                    <span className={styles.capabilityChip}>
                      ✓ EPUB {caps.epubVersion}
                    </span>
                  )}
                  {caps.mediaOverlays && (
                    <span className={styles.capabilityChip}>
                      ✓ {t("mediaOverlays")}
                    </span>
                  )}
                  {caps.layout && (
                    <span className={styles.capabilityChip}>
                      {caps.layout === "fixed"
                        ? t("layoutFixed")
                        : t("layoutReflowable")}
                    </span>
                  )}
                </div>
              )}

              {tech && (
                <details className={styles.manifestationTechnical}>
                  <summary>{t("technicalDetails")}</summary>
                  <dl className={styles.technicalGrid}>
                    {tech.epubVersion && (
                      <>
                        <dt>{t("epubVersion")}</dt>
                        <dd>{tech.epubVersion}</dd>
                      </>
                    )}
                    {tech.mediaOverlays != null && (
                      <>
                        <dt>{t("mediaOverlays")}</dt>
                        <dd>{tech.mediaOverlays ? t("yes") : t("no")}</dd>
                      </>
                    )}
                    {tech.layout && (
                      <>
                        <dt>{t("layout")}</dt>
                        <dd>
                          {tech.layout === "fixed"
                            ? t("layoutFixed")
                            : t("layoutReflowable")}
                        </dd>
                      </>
                    )}
                    {tech.language && (
                      <>
                        <dt>{t("language")}</dt>
                        <dd>{tech.language}</dd>
                      </>
                    )}
                    {tech.hasNavigation != null && (
                      <>
                        <dt>{t("navigation")}</dt>
                        <dd>{tech.hasNavigation ? t("yes") : t("no")}</dd>
                      </>
                    )}
                    {tech.fileSize != null && (
                      <>
                        <dt>{t("fileSize")}</dt>
                        <dd>{formatSize(tech.fileSize)}</dd>
                      </>
                    )}
                    {tech.checksum && (
                      <>
                        <dt>{t("checksum")}</dt>
                        <dd>{tech.checksum}</dd>
                      </>
                    )}
                    {tech.validationStatus && (
                      <>
                        <dt>{t("validationStatus")}</dt>
                        <dd>{tech.validationStatus}</dd>
                      </>
                    )}
                    {tech.drmStatus && (
                      <>
                        <dt>{t("drmStatus")}</dt>
                        <dd>{tech.drmStatus}</dd>
                      </>
                    )}
                  </dl>
                </details>
              )}
            </div>
          );
        })}

        {holding && holdingSummary && (
          <div className={styles.manifestationRow}>
            <div className={styles.manifestationHeader}>
              <span className={styles.manifestationFormat}>
                {t("physicalCopy")}
              </span>
              {canEdit && (
                <div className={styles.curatorMenu}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => {
                      setIdentifying((v) => !v);
                      setIdentifyTarget(holding.manifestationId ?? "");
                    }}
                    disabled={pending}
                  >
                    {t("identifyEdition")}
                  </button>{" "}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => void removeOwnership()}
                    disabled={pending}
                  >
                    {t("removeOwnership")}
                  </button>
                </div>
              )}
            </div>
            <p className={styles.readingStateMeta}>{holdingSummary}</p>
            {identifying && canEdit && (
              <p className={styles.readingStateMeta}>
                <label>
                  {t("chooseEdition")}{" "}
                  <select
                    value={identifyTarget}
                    onChange={(e) => setIdentifyTarget(e.target.value)}
                    disabled={pending}
                  >
                    <option value="">{t("chooseEdition")}</option>
                    {book.manifestations.map((m) => (
                      <option key={m.id} value={m.id}>
                        {[m.label, m.externalId].filter(Boolean).join(" · ") ||
                          m.id}
                      </option>
                    ))}
                  </select>
                </label>{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void identify()}
                  disabled={pending || !identifyTarget}
                >
                  {t("save")}
                </button>{" "}
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setIdentifying(false)}
                  disabled={pending}
                >
                  {t("cancel")}
                </button>
              </p>
            )}
          </div>
        )}

        {!holding && canEdit && (
          <div className={styles.readingStateActions}>
            <Button
              type="button"
              variant="default"
              onClick={() => void markOwned()}
              disabled={pending}
            >
              {t("markAsOwned")}
            </Button>
          </div>
        )}

        {actionError && (
          <p className={styles.readingStateMeta} role="alert">
            {actionError}
          </p>
        )}
      </div>
    </WorkDetailSection>
  );
}
