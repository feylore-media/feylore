import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FormattingSuggestionDto,
  SimilarTermDto,
  VocabularyKind,
} from "@shared/metadata-formatting";
import { api } from "../../../app/api";
import { Button } from "../../primitives";
import fmtStyles from "./formatting.module.css";
import styles from "../metadata-settings.module.css";

export function SuggestionsPanel({
  kind,
  suggestions,
  canWrite,
  onResolved,
}: {
  kind: VocabularyKind;
  suggestions: FormattingSuggestionDto[];
  canWrite: boolean;
  onResolved: () => Promise<void>;
}) {
  const { t } = useTranslation("admin");
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarTermDto[]>([]);

  if (suggestions.length === 0) return null;

  async function resolve(
    id: string,
    action: "accept_alias" | "assign_existing_term" | "ignore",
    termId?: string,
  ) {
    await api(`/metadata/formatting/suggestions/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action, termId }),
    });
    setChoosingFor(null);
    await onResolved();
  }

  async function openChooseAnother(suggestion: FormattingSuggestionDto) {
    setChoosingFor(suggestion.id);
    const res = await api<{ data: SimilarTermDto[] }>(
      `/metadata/formatting/suggestions/similar?kind=${kind}&value=${encodeURIComponent(suggestion.rawValue)}`,
    );
    setSimilar(res.data);
  }

  return (
    <section className={fmtStyles.suggestionsPanel}>
      <h3 className={styles.sectionTitle}>{t("formattingSuggestionsTitle")}</h3>
      <p className={styles.sectionLead}>{t("formattingSuggestionsDescription")}</p>
      <ul className={fmtStyles.tree}>
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className={fmtStyles.suggestionItem}>
            <strong>{suggestion.rawValue}</strong>
            {suggestion.suggestedTermName && (
              <p className={fmtStyles.languageExample}>
                {t("formattingSuggestedTerm", {
                  name: suggestion.suggestedTermName,
                })}
              </p>
            )}
            {canWrite && (
              <div className={fmtStyles.suggestionActions}>
                {suggestion.suggestedTermId && (
                  <Button
                    type="button"
                    onClick={() =>
                      void resolve(suggestion.id, "accept_alias", suggestion.suggestedTermId!)
                    }
                  >
                    {t("formattingAcceptSuggestion")}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => void openChooseAnother(suggestion)}
                >
                  {t("formattingChooseAnother")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void resolve(suggestion.id, "ignore")}
                >
                  {t("formattingIgnoreSuggestion")}
                </Button>
              </div>
            )}
            {choosingFor === suggestion.id && (
              <div className={fmtStyles.suggestionActions}>
                {similar.map((item) => (
                  <Button
                    key={item.termId}
                    type="button"
                    onClick={() =>
                      void resolve(suggestion.id, "assign_existing_term", item.termId)
                    }
                  >
                    {item.name}
                  </Button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
