import { NavLink, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  bookPath,
  bookMetadataPath,
  bookJournalPath,
  bookDnaPath,
  bookHistoryPath,
  bookReviewPath,
} from "../../../../routes/paths";
import clubStyles from "../../../components/clubs/clubs.module.css";

export function BookDetailNavigation() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;

  const tabs = [
    { to: bookPath(slug), label: t("tabOverview"), end: true },
    { to: bookMetadataPath(slug), label: t("tabMetadata"), end: false },
    { to: bookJournalPath(slug), label: t("tabJournal"), end: false },
    { to: bookDnaPath(slug), label: t("tabDna"), end: false },
    { to: bookHistoryPath(slug), label: t("tabHistory"), end: false },
    { to: bookReviewPath(slug), label: t("tabReview"), end: false },
  ];

  return (
    <nav className={clubStyles.clubTabNav} aria-label={t("bookDetailTabs")}>
      {tabs.map((tab) => (
        <NavLink
          id={
            tab.to === bookReviewPath(slug) ? "book-review-opener" : undefined
          }
          aria-haspopup={tab.to === bookReviewPath(slug) ? "dialog" : undefined}
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            isActive
              ? `${clubStyles.clubTabButton} ${clubStyles.clubTabButtonActive}`
              : clubStyles.clubTabButton
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
