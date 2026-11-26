import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import { bookMetadataPath } from "../../../../routes/paths";
import styles from "../../../work-detail/work-detail.module.css";

interface FormatsSummarySectionProps {
  book: BookDetail;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormatsSummarySection({ book }: FormatsSummarySectionProps) {
  const { t } = useTranslation("books");

  if (book.representations.length === 0) return null;

  return (
    <WorkDetailSection label={t("formatsSummary")} rule>
      <ul className={styles.relatedList}>
        {book.representations.map((rep) => {
          const contentFile =
            rep.files.find((f) => f.role === "content") ?? rep.files[0];
          const parts = [rep.format.toUpperCase()];
          if (contentFile) parts.push(formatSize(contentFile.size));
          if (rep.capabilities?.epubVersion) {
            parts.push(`EPUB ${rep.capabilities.epubVersion}`);
          }
          return (
            <li key={rep.id}>
              {parts.join(" · ")}
              {rep.unavailableAt && ` (${t("unavailable")})`}
            </li>
          );
        })}
      </ul>
      <Link to={bookMetadataPath(book.slug)} className={styles.journalLink}>
        {t("viewAllMetadata")}
      </Link>
    </WorkDetailSection>
  );
}
