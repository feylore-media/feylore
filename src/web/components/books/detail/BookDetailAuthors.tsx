import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { WorkDetailSection } from "../../work-detail/WorkDetailSection";
import styles from "../../work-detail/work-detail.module.css";

interface BookDetailAuthorsProps {
  book: BookDetail;
}

export function BookDetailAuthors({ book }: BookDetailAuthorsProps) {
  const { t } = useTranslation("books");
  if (book.authors.length === 0) return null;

  return (
    <WorkDetailSection label={t("authorsLabel")} rule>
      <ul className={styles.authorList}>
        {book.authors.map((author) => (
          <li key={author.id}>
            {author.peopleSlug ? (
              <Link to={`/people/${author.peopleSlug}`}>{author.name}</Link>
            ) : (
              <Link
                to={`/books/library?author=${encodeURIComponent(author.name)}`}
              >
                {author.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </WorkDetailSection>
  );
}
