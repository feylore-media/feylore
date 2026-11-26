import { useTranslation } from "react-i18next";
import { SHELF_SCOPE_IDS, type ShelfScopeId } from "@shared/shelf-scopes";
import styles from "./shelf-editor.module.css";

interface ShelfScopeControlProps {
  value: ShelfScopeId;
  onChange: (scope: ShelfScopeId) => void;
  scopeWarning: number | null;
  scopeChangeConfirm: boolean;
  onScopeChangeConfirm: (confirmed: boolean) => void;
}

export function ShelfScopeControl({
  value,
  onChange,
  scopeWarning,
  scopeChangeConfirm,
  onScopeChangeConfirm,
}: ShelfScopeControlProps) {
  const { t } = useTranslation("shelves");

  return (
    <section className={styles.section} aria-labelledby="shelf-scope-heading">
      <h3 id="shelf-scope-heading" className={styles.sectionTitle}>
        {t("sectionScope")}
      </h3>
      <p className={styles.sectionLead}>{t("scopeLead")}</p>
      <div className={styles.scopeRow}>
        <select
          id="shelfScope"
          className={styles.scopeSelect}
          value={value}
          onChange={(e) => onChange(e.target.value as ShelfScopeId)}
        >
          {SHELF_SCOPE_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`scopes.${id}`)}
            </option>
          ))}
        </select>
        <p className={styles.scopeDescription}>
          {t(`scopeDescriptions.${value}`)}
        </p>
      </div>
      {scopeWarning != null && scopeWarning > 0 && (
        <div className={styles.callout} role="alert">
          <p>{t("scopeChangeWarning", { count: scopeWarning })}</p>
          <label className={styles.calloutLabel}>
            <input
              type="checkbox"
              checked={scopeChangeConfirm}
              onChange={(e) => onScopeChangeConfirm(e.target.checked)}
            />
            {t("scopeChangeConfirm")}
          </label>
        </div>
      )}
    </section>
  );
}
