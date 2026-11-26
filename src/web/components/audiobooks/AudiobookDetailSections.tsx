import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { AudiobookDetail } from "@shared/audiobooks";
import { Button } from "../primitives";
import { api } from "../../app/api";
import styles from "./audiobooks.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function deriveRepresentationRuntimeSeconds(
  runtimeSeconds: number | null,
  files: Array<{ durationSeconds: number | null }>,
): number | null {
  if (runtimeSeconds != null && runtimeSeconds > 0) return runtimeSeconds;
  const total = files.reduce((sum, f) => sum + (f.durationSeconds ?? 0), 0);
  return total > 0 ? total : null;
}

interface AudiobookDetailSectionsProps {
  audiobook: AudiobookDetail;
  rating: number | null;
  onRatingChange: (rating: number | null) => void;
}

function manifestationAsin(
  manifestation: AudiobookDetail["manifestations"][number],
): string | null {
  if (!manifestation.externalId) return null;
  if (
    manifestation.externalIdType &&
    manifestation.externalIdType.toLowerCase() !== "asin"
  ) {
    return null;
  }
  return manifestation.externalId;
}

export function AudiobookDetailSections({
  audiobook,
  rating,
  onRatingChange,
}: AudiobookDetailSectionsProps) {
  const { t } = useTranslation("audiobooks");
  const [descExpanded, setDescExpanded] = useState(false);
  const longDescription = (audiobook.description?.length ?? 0) > 400;

  async function setRating(value: number) {
    await api(`/audiobooks/${audiobook.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: value }),
    });
    onRatingChange(value);
  }

  async function clearRating() {
    await api(`/audiobooks/${audiobook.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: null }),
    });
    onRatingChange(null);
  }

  const repsByManifestation = new Map(
    audiobook.representations.map((rep) => [rep.manifestationId, rep]),
  );

  return (
    <>
      {audiobook.description ? (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("description")}</h2>
          <p
            className={`${styles.detailDescription} ${!descExpanded && longDescription ? styles.detailDescriptionCollapsed : ""}`}
          >
            {audiobook.description}
          </p>
          {longDescription && (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setDescExpanded((e) => !e)}
            >
              {descExpanded ? t("showLess") : t("showMore")}
            </button>
          )}
        </section>
      ) : (
        <p className={styles.cardMeta}>{t("noDescription")}</p>
      )}

      {audiobook.manifestations.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("representations")}</h2>
          {audiobook.manifestations.map((manifestation) => {
            const rep = repsByManifestation.get(manifestation.id);
            const asin = manifestationAsin(manifestation);
            const runtime = rep
              ? deriveRepresentationRuntimeSeconds(
                  rep.runtimeSeconds,
                  rep.files,
                )
              : null;
            const runtimeLabel = formatRuntime(runtime);

            return (
              <div key={manifestation.id} className={styles.formatRow}>
                {manifestation.label && (
                  <span className={styles.formatBadge}>{manifestation.label}</span>
                )}
                {asin && (
                  <span className={styles.cardMeta}>
                    {t("asin")}: {asin}
                  </span>
                )}
                {runtimeLabel && (
                  <span className={styles.cardMeta}>
                    {t("runtime")}: {runtimeLabel}
                  </span>
                )}
                {rep && (
                  <span className={styles.formatBadge}>
                    {rep.format.toUpperCase()}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {audiobook.relationships.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("relationships")}</h2>
          <ul className={styles.list}>
            {audiobook.relationships.map((rel) => (
              <li key={rel.id} className={styles.listItem}>
                {rel.targetHref ? (
                  <Link to={rel.targetHref}>
                    {rel.targetTitle ?? rel.targetId}
                  </Link>
                ) : (
                  rel.targetTitle ?? rel.targetId
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.detailSection}>
        <h2 className={styles.detailSectionTitle}>{t("rate")}</h2>
        <div className={styles.starRating} role="group" aria-label={t("rate")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              type="button"
              className={`${styles.starButton} ${rating != null && n <= rating ? styles.starFilled : ""}`}
              onClick={() => setRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} stars`}
            >
              ★
            </Button>
          ))}
          {rating != null && (
            <button type="button" className={styles.starClear} onClick={clearRating}>
              {t("clearRating")}
            </button>
          )}
        </div>
      </section>

      {(audiobook.genres.length > 0 || audiobook.subtitle) && (
        <details className={`${styles.detailSection} ${styles.detailsCollapsible}`}>
          <summary>{t("details")}</summary>
          <dl className={styles.detailsMeta}>
            {audiobook.genres.length > 0 && (
              <>
                <dt>{t("genresLabel")}</dt>
                <dd>{audiobook.genres.join(", ")}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </>
  );
}
