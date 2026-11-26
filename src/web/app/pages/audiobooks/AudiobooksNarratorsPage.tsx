import { useTranslation } from "react-i18next";
import { ContextualPeoplePage } from "../people/ContextualPeoplePage";

export function AudiobooksNarratorsPage() {
  const { t } = useTranslation("audiobooks");
  return (
    <ContextualPeoplePage
      endpoint="/audiobooks/narrators/people"
      title={t("narrators")}
    />
  );
}