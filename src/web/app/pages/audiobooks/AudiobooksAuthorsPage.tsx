import { useTranslation } from "react-i18next";
import { ContextualPeoplePage } from "../people/ContextualPeoplePage";

export function AudiobooksAuthorsPage() {
  const { t } = useTranslation("audiobooks");
  return (
    <ContextualPeoplePage
      endpoint="/audiobooks/authors/people"
      title={t("authors")}
    />
  );
}