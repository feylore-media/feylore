import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../../../app/api";
import { bookPath } from "../../../../routes/paths";
import type { BookReview, RatingSystemConfig } from "@shared/ratings";
import { RatingVisualization } from "../../../ratings/RatingVisualization";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import styles from "./my-rating-section.module.css";

type ReviewResponse = { data: { review: BookReview | null } };
type ConfigResponse = { data: RatingSystemConfig };

export function MyRatingSection({ slug }: { slug: string }) {
  const { t } = useTranslation("books");
  const [data, setData] = useState<{
    review: BookReview;
    config: RatingSystemConfig;
  } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<ReviewResponse>(`/books/${slug}/review`),
      api<ConfigResponse>(`/books/${slug}/review/config`),
    ])
      .then(([reviewResponse, configResponse]) => {
        const review = reviewResponse.data.review;
        if (active && review?.status === "completed")
          setData({ review, config: configResponse.data });
      })
      .catch(() => {
        /* The review route provides the actionable error state. */
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (!data) return null;
  const { review, config } = data;
  return (
    <WorkDetailSection label={t("myRating")} rule>
      <div className={styles.layout}>
        <RatingVisualization
          review={review}
          coreDimensions={config.coreDimensions}
          genreDefinitions={config.genreDefinitions}
          scale={config.settings.scale}
          variant="compact"
        />
        <div className={styles.verdict}>
          {review.finalRating != null && (
            <>
              <StarDisplay
                value={review.finalRating}
                scale={config.settings.scale}
              />
              <strong className={styles.ratingNumber}>
                {review.finalRating.toFixed(1)}
              </strong>
            </>
          )}
          {review.recommendation && (
            <p className={styles.recommendation}>
              {review.recommendation === "yes" ? "✓ " : "× "}
              {t(
                review.recommendation === "yes"
                  ? "reviewRecommendationYes"
                  : "reviewRecommendationNo",
              )}
            </p>
          )}
          <Link className={styles.reviewLink} to={`${bookPath(slug)}/review`}>
            {t("viewReview")}
          </Link>
        </div>
      </div>
    </WorkDetailSection>
  );
}

function StarDisplay({ value, scale }: { value: number; scale: number }) {
  const { t } = useTranslation("books");
  const normalized = scale === 10 ? value / 2 : value;
  const filled = Math.floor(normalized);
  const half = normalized - filled >= 0.25 && normalized - filled < 0.75;
  const stars = `${"★".repeat(filled)}${half ? "◐" : ""}${"☆".repeat(Math.max(0, 5 - filled - (half ? 1 : 0)))}`;
  return (
    <span
      className={styles.stars}
      aria-label={t("reviewRatingValue", { value, max: scale })}
    >
      {stars}
    </span>
  );
}
