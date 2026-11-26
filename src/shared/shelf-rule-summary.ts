import { isShelfExpression, type ShelfExpression } from "./shelf-expression.js";
import { getShelfRuleField } from "./shelf-rule-fields.js";

/** A compact explanation, never a substitute for Shelf evaluation. */
export function shelfRuleSummary(
  expression: ShelfExpression | Record<string, unknown> | null | undefined,
  depth = 0,
): string | null {
  if (!expression || !isShelfExpression(expression) || depth > 5) return null;
  if (expression.type === "group") {
    const children = expression.children
      .slice(0, 12)
      .map((child) => shelfRuleSummary(child, depth + 1))
      .filter(Boolean);
    return children.length
      ? "(" +
          children.join(expression.operator === "and" ? " AND " : " OR ") +
          ")"
      : null;
  }
  const field = getShelfRuleField(expression.field);
  if (!field) return null;
  const operators = {
    eq: "=",
    neq: "≠",
    contains: "contains",
    in: "in",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
  };
  const value = Array.isArray(expression.value)
    ? expression.value.join(", ")
    : String(expression.value);
  return `${field.label} ${operators[expression.operator]} ${value}`;
}
