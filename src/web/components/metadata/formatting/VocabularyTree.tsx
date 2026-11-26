import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VocabularyKind, VocabularyTermDto } from "@shared/metadata-formatting";
import fmtStyles from "./formatting.module.css";

function collectIds(terms: VocabularyTermDto[]): string[] {
  const ids: string[] = [];
  for (const term of terms) {
    ids.push(term.id);
    ids.push(...collectIds(term.children));
  }
  return ids;
}

function defaultCollapsedIds(terms: VocabularyTermDto[], depth = 0): Set<string> {
  const collapsed = new Set<string>();
  for (const term of terms) {
    if (term.children.length > 0) {
      if (depth >= 1) collapsed.add(term.id);
      for (const id of defaultCollapsedIds(term.children, depth + 1)) {
        collapsed.add(id);
      }
    }
  }
  return collapsed;
}

export function VocabularyTree({
  terms,
  canWrite,
  highlightIds,
  onEdit,
  onAddChild,
  onManageAliases,
  onDelete,
}: {
  terms: VocabularyTermDto[];
  canWrite: boolean;
  highlightIds?: Set<string>;
  onEdit: (term: VocabularyTermDto) => void;
  onAddChild: (parent: VocabularyTermDto) => void;
  onManageAliases: (term: VocabularyTermDto) => void;
  onDelete: (term: VocabularyTermDto) => void;
}) {
  const { t } = useTranslation("admin");
  const [collapsed, setCollapsed] = useState(() => defaultCollapsedIds(terms));

  useEffect(() => {
    if (!highlightIds?.size) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of highlightIds) next.delete(id);
      return next;
    });
  }, [highlightIds]);

  const allIds = useMemo(() => new Set(collectIds(terms)), [terms]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTerms(items: VocabularyTermDto[], depth = 0) {
    return (
      <ul className={depth === 0 ? fmtStyles.tree : fmtStyles.treeChildren}>
        {items.map((term) => {
          const hasChildren = term.children.length > 0;
          const isCollapsed = collapsed.has(term.id);
          const highlighted = highlightIds?.has(term.id);
          return (
            <li key={term.id} className={fmtStyles.treeItem}>
              <div
                className={`${fmtStyles.treeRow} ${highlighted ? fmtStyles.highlight : ""}`}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className={fmtStyles.treeToggle}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? t("formattingExpand") : t("formattingCollapse")}
                    onClick={() => toggle(term.id)}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span className={fmtStyles.treeTogglePlaceholder} aria-hidden />
                )}
                <span className={fmtStyles.treeLabel}>
                  {term.name}
                  <span className={fmtStyles.treeCount}> ({term.usageCount})</span>
                </span>
                {canWrite && (
                  <span className={fmtStyles.treeActions}>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      onClick={() => onEdit(term)}
                    >
                      {t("formattingEdit")}
                    </button>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      onClick={() => onAddChild(term)}
                    >
                      {t("formattingAddChild")}
                    </button>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      onClick={() => onManageAliases(term)}
                    >
                      {t("formattingManageAliases")}
                    </button>
                    <button
                      type="button"
                      className={fmtStyles.actionButton}
                      onClick={() => onDelete(term)}
                    >
                      {t("formattingDelete")}
                    </button>
                  </span>
                )}
              </div>
              {hasChildren && !isCollapsed && renderTerms(term.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  if (terms.length === 0) {
    return <p className={fmtStyles.emptyState}>{t("formattingVocabularyEmpty")}</p>;
  }

  return (
    <div>
      {highlightIds && highlightIds.size > 0 && (
        <p className={fmtStyles.emptyState}>{t("formattingSearchActive")}</p>
      )}
      {renderTerms(terms)}
      {allIds.size > 0 && (
        <button
          type="button"
          className={fmtStyles.actionButton}
          style={{ marginTop: "var(--space-3)" }}
          onClick={() => setCollapsed(defaultCollapsedIds(terms))}
        >
          {t("formattingResetCollapse")}
        </button>
      )}
    </div>
  );
}

export function flattenTerms(terms: VocabularyTermDto[]): VocabularyTermDto[] {
  const flat: VocabularyTermDto[] = [];
  for (const term of terms) {
    flat.push(term);
    flat.push(...flattenTerms(term.children));
  }
  return flat;
}

export type { VocabularyKind };
