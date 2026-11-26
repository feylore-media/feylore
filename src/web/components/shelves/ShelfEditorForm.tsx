import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ShelfScopeId } from "@shared/shelf-scopes";
import { getRuleFieldsForScope } from "@shared/shelf-rule-fields";
import { getSortFieldsForScope } from "@shared/shelf-sort";
import type { ShelfEditorPublic, ShelfVisibility } from "@shared/shelves";
import type { ShelfExpression } from "@shared/shelf-expression";
import type { ShelfSortLevel } from "@shared/shelf-sort";
import { ShelfIconPicker } from "./ShelfIconPicker";
import { ShelfScopeControl } from "./ShelfScopeControl";
import { ShelfVisibilityControl } from "./ShelfVisibilityControl";
import { ShelfEditorsControl } from "./ShelfEditorsControl";
import { ShelfRuleBuilder } from "./ShelfRuleBuilder";
import { ShelfSortLevelsEditor } from "./ShelfSortLevelsEditor";
import styles from "./shelf-editor.module.css";

export interface ShelfEditorValues {
  name: string;
  icon: string;
  scope: ShelfScopeId;
  visibility: ShelfVisibility;
  membershipExpression: ShelfExpression | null;
  sortLevels: ShelfSortLevel[];
  editors: ShelfEditorPublic[];
  confirmEmptyEditors: boolean;
  scopeChangeConfirm: boolean;
}

export type ShelfEditorValidationError =
  | "confirmEmptyEditorsRequired"
  | "scopeChangeConfirmRequired";

interface ShelfEditorFormProps {
  formId: string;
  initial: ShelfEditorValues;
  shelfId?: string;
  onSubmit: (values: ShelfEditorValues) => Promise<void>;
  onScopePreview?: (scope: ShelfScopeId) => Promise<number>;
  onValuesChange?: (values: ShelfEditorValues) => void;
  onSavingChange?: (saving: boolean) => void;
}

export function ShelfEditorForm({
  formId,
  initial,
  shelfId,
  onSubmit,
  onScopePreview,
  onValuesChange,
  onSavingChange,
}: ShelfEditorFormProps) {
  const { t } = useTranslation("shelves");
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [scopeWarning, setScopeWarning] = useState<number | null>(null);
  const [validationError, setValidationError] =
    useState<ShelfEditorValidationError | null>(null);

  function updateValues(patch: Partial<ShelfEditorValues>) {
    setValues((v) => {
      const next = { ...v, ...patch };
      onValuesChange?.(next);
      return next;
    });
    setValidationError(null);
  }

  async function handleScopeChange(scope: ShelfScopeId) {
    if (onScopePreview && shelfId) {
      const count = await onScopePreview(scope);
      setScopeWarning(count > 0 ? count : null);
      updateValues({
        scope,
        scopeChangeConfirm: count > 0 ? false : values.scopeChangeConfirm,
      });
    } else {
      setScopeWarning(null);
      updateValues({ scope });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      values.visibility === "collaborative" &&
      values.editors.length === 0 &&
      !values.confirmEmptyEditors
    ) {
      setValidationError("confirmEmptyEditorsRequired");
      return;
    }
    if (scopeWarning && scopeWarning > 0 && !values.scopeChangeConfirm) {
      setValidationError("scopeChangeConfirmRequired");
      return;
    }
    setSaving(true);
    onSavingChange?.(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  const ruleFields = getRuleFieldsForScope(values.scope);
  const sortFields = getSortFieldsForScope(values.scope);

  return (
    <form id={formId} className={styles.form} onSubmit={handleSubmit}>
      {validationError && (
        <div className={styles.validationBanner} role="alert">
          {t(validationError)}
        </div>
      )}

      <section className={styles.section} aria-labelledby="shelf-identity-heading">
        <h3 id="shelf-identity-heading" className={styles.sectionTitle}>
          {t("sectionIdentity")}
        </h3>
        <div className={styles.identityRow}>
          <ShelfIconPicker
            value={values.icon}
            onChange={(icon) => updateValues({ icon })}
          />
          <input
            id="shelfName"
            className={styles.nameInput}
            type="text"
            value={values.name}
            placeholder={t("shelfNamePlaceholder")}
            onChange={(e) => updateValues({ name: e.target.value })}
            required
            aria-label={t("shelfName")}
          />
        </div>
      </section>

      <ShelfScopeControl
        value={values.scope}
        onChange={(scope) => void handleScopeChange(scope)}
        scopeWarning={scopeWarning}
        scopeChangeConfirm={values.scopeChangeConfirm}
        onScopeChangeConfirm={(confirmed) =>
          updateValues({ scopeChangeConfirm: confirmed })
        }
      />

      <ShelfVisibilityControl
        value={values.visibility}
        onChange={(visibility) => updateValues({ visibility })}
      />

      {values.visibility === "collaborative" && (
        <ShelfEditorsControl
          editors={values.editors}
          onChange={(editors) => updateValues({ editors })}
          confirmEmptyEditors={values.confirmEmptyEditors}
          onConfirmEmptyEditorsChange={(confirmEmptyEditors) =>
            updateValues({ confirmEmptyEditors })
          }
        />
      )}

      <ShelfRuleBuilder
        expression={values.membershipExpression}
        fields={ruleFields}
        onChange={(membershipExpression) =>
          updateValues({ membershipExpression })
        }
      />

      <ShelfSortLevelsEditor
        levels={values.sortLevels}
        fields={sortFields}
        onChange={(sortLevels) => updateValues({ sortLevels })}
      />

      <input type="submit" hidden disabled={saving} aria-hidden tabIndex={-1} />
    </form>
  );
}
