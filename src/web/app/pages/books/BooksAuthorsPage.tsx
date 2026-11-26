import { useTranslation } from "react-i18next";
import { ContextualPeoplePage } from "../people/ContextualPeoplePage";

export function BooksAuthorsPage() {
  const { t } = useTranslation("books");
  return (
    <ContextualPeoplePage
      endpoint="/books/authors/people"
      title={t("authors")}
    />
  );
}