import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ShelfPublic } from "@shared/shelves";
import { AddToShelfMenu } from "../../AddToShelfMenu";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import { ShelfVisibilityIndicator } from "../../../shelves/ShelfVisibilityIndicator";
import styles from "../../../work-detail/work-detail.module.css";

interface OverviewShelvesSectionProps {
  bookId: string;
  shelves: ShelfPublic[];
  onShelfChange?: () => void;
}

export function OverviewShelvesSection({
  bookId,
  shelves,
  onShelfChange,
}: OverviewShelvesSectionProps) {
  const { t } = useTranslation("books");

  return (
    <WorkDetailSection label={t("yourLibrary")} rule>
      {shelves.length > 0 && (
        <div className={styles.chipList}>
          {shelves.map((s) => (
            <Link key={s.id} to={`/shelves/${s.id}`} className={styles.chip}>
              {s.name}
              <ShelfVisibilityIndicator
                visibility={s.visibility}
                isOwner={s.isOwner}
                compact
              />
            </Link>
          ))}
        </div>
      )}
      <AddToShelfMenu
        bookId={bookId}
        memberShelfIds={shelves.map((s) => s.id)}
        onAdded={onShelfChange}
      />
    </WorkDetailSection>
  );
}

interface OverviewAboutSectionProps {
  description: string | null;
}

export function OverviewAboutSection({ description }: OverviewAboutSectionProps) {
  const { t } = useTranslation("books");
  const [expanded, setExpanded] = useState(false);

  if (!description) return null;

  const long = description.length > 400;

  return (
    <WorkDetailSection label={t("about")} rule>
      <p
        className={`${styles.identityDescription} ${!expanded && long ? styles.identityDescriptionCollapsed : ""}`}
      >
        {description}
      </p>
      {long && (
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </WorkDetailSection>
  );
}

interface OverviewGenresSectionProps {
  genres: string[];
}

export function OverviewGenresSection({ genres }: OverviewGenresSectionProps) {
  const { t } = useTranslation("books");
  if (genres.length === 0) return null;

  return (
    <WorkDetailSection label={t("genresLabel")} rule>
      <div className={styles.chipList}>
        {genres.map((genre) => (
          <Link
            key={genre}
            to={`/books/library?genre=${encodeURIComponent(genre)}`}
            className={styles.chip}
          >
            {genre}
          </Link>
        ))}
      </div>
    </WorkDetailSection>
  );
}
