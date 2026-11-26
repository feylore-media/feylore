import { useTranslation } from "react-i18next";
import type { ShelfExpression } from "@shared/shelf-expression";
import type { ShelfRuleFieldDefinition } from "@shared/shelf-rule-fields";
import styles from "./shelf-editor.module.css";
import { CloseIconButton } from "../icons/UiIconButtons";

interface ShelfRuleBuilderProps {
  expression: ShelfExpression | null;
  fields: ShelfRuleFieldDefinition[];
  onChange: (expr: ShelfExpression | null) => void;
}

function defaultRule(fields: ShelfRuleFieldDefinition[]): ShelfExpression {
  const first = fields[0];
  return {
    type: "rule",
    field: first?.id ?? "title",
    operator: "contains",
    value: "",
  };
}

function defaultGroup(fields: ShelfRuleFieldDefinition[]): ShelfExpression {
  return {
    type: "group",
    operator: "and",
    children: [defaultRule(fields)],
  };
}

export function ShelfRuleBuilder({
  expression,
  fields,
  onChange,
}: ShelfRuleBuilderProps) {
  const { t } = useTranslation("shelves");

  function handleAddRule() {
    if (!expression) {
      onChange(defaultGroup(fields));
      return;
    }
    if (expression.type === "group") {
      onChange({
        ...expression,
        children: [...expression.children, defaultRule(fields)],
      });
    }
  }

  function handleClear() {
    onChange(null);
  }

  return (
    <section className={styles.section} aria-labelledby="shelf-membership-heading">
      <div className={styles.sectionHeaderRow}>
        <h3 id="shelf-membership-heading" className={styles.sectionTitle}>
          {t("sectionMembership")}
        </h3>
        {expression && (
          <button type="button" className={styles.textAction} onClick={handleClear}>
            {t("clearRules")}
          </button>
        )}
      </div>

      {!expression ? (
        <>
          <p className={styles.emptyState}>{t("noAutomaticRules")}</p>
          <button type="button" className={styles.addAction} onClick={handleAddRule}>
            + {t("addRule")}
          </button>
        </>
      ) : (
        <>
          <p className={styles.sectionLead}>{t("membershipLead")}</p>
          <div className={styles.ruleBuilder}>
            {expression.type === "group" ? (
              <RuleGroup
                expression={expression}
                fields={fields}
                nested={false}
                onChange={onChange}
                onRemove={() => onChange(null)}
              />
            ) : (
              <RuleRow
                expression={expression}
                fields={fields}
                onChange={onChange}
                onRemove={() => onChange(null)}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function RuleGroup({
  expression,
  fields,
  nested,
  onChange,
  onRemove,
}: {
  expression: Extract<ShelfExpression, { type: "group" }>;
  fields: ShelfRuleFieldDefinition[];
  nested: boolean;
  onChange: (expr: ShelfExpression | null) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation("shelves");

  function updateChild(index: number, updated: ShelfExpression | null) {
    const children = [...expression.children];
    if (updated === null) {
      children.splice(index, 1);
      if (children.length === 0) {
        onRemove?.();
        return;
      }
      onChange({ ...expression, children });
      return;
    }
    children[index] = updated;
    onChange({ ...expression, children });
  }

  function addRule() {
    onChange({
      ...expression,
      children: [...expression.children, defaultRule(fields)],
    });
  }

  function addGroup() {
    onChange({
      ...expression,
      children: [...expression.children, defaultGroup(fields)],
    });
  }

  return (
    <div className={nested ? styles.ruleGroupNested : styles.ruleGroup}>
      <select
        className={styles.groupOperator}
        value={expression.operator}
        aria-label={t("groupOperator")}
        onChange={(e) =>
          onChange({
            ...expression,
            operator: e.target.value as "and" | "or",
          })
        }
      >
        <option value="and">{t("allOfThese")}</option>
        <option value="or">{t("anyOfThese")}</option>
      </select>

      {expression.children.map((child, i) =>
        child.type === "group" ? (
          <RuleGroup
            key={i}
            expression={child}
            fields={fields}
            nested
            onChange={(updated) => updateChild(i, updated)}
            onRemove={() => updateChild(i, null)}
          />
        ) : (
          <RuleRow
            key={i}
            expression={child}
            fields={fields}
            onChange={(updated) => updateChild(i, updated)}
            onRemove={() => updateChild(i, null)}
          />
        ),
      )}

      <div className={styles.ruleActions}>
        <button type="button" className={styles.addAction} onClick={addRule}>
          + {t("addRule")}
        </button>
        <button type="button" className={styles.addAction} onClick={addGroup}>
          + {t("addGroup")}
        </button>
      </div>
    </div>
  );
}

function RuleRow({
  expression,
  fields,
  onChange,
  onRemove,
}: {
  expression: Extract<ShelfExpression, { type: "rule" }>;
  fields: ShelfRuleFieldDefinition[];
  onChange: (expr: ShelfExpression) => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation("shelves");
  const fieldDef = fields.find((f) => f.id === expression.field) ?? fields[0];
  const operators = (fieldDef?.operators ?? ["eq", "contains"]).filter((op) =>
    ["eq", "contains"].includes(op),
  );

  const operator = operators.includes(expression.operator as "eq" | "contains")
    ? expression.operator
    : (operators[0] ?? "contains");

  return (
    <div className={styles.ruleRow}>
      <select
        className={styles.ruleSelect}
        value={expression.field}
        aria-label={t("ruleField")}
        onChange={(e) =>
          onChange({ ...expression, field: e.target.value })
        }
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className={styles.ruleSelect}
        value={operator}
        aria-label={t("ruleOperator")}
        onChange={(e) =>
          onChange({
            ...expression,
            operator: e.target.value as typeof expression.operator,
          })
        }
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {t(`operators.${op}`)}
          </option>
        ))}
      </select>
      <input
        className={styles.ruleValue}
        value={String(expression.value ?? "")}
        aria-label={t("ruleValue")}
        onChange={(e) =>
          onChange({ ...expression, value: e.target.value })
        }
      />
      {onRemove && (
        <CloseIconButton
          className={styles.removeBtn}
          aria-label={t("removeRule")}
          onClick={onRemove}
        />
      )}
    </div>
  );
}
