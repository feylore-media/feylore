import { z } from "zod";

export const SHELF_RULE_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

export type ShelfRuleOperator = (typeof SHELF_RULE_OPERATORS)[number];

export type ShelfExpression =
  | { type: "group"; operator: "and" | "or"; children: ShelfExpression[] }
  | {
      type: "rule";
      field: string;
      operator: ShelfRuleOperator;
      value: unknown;
    };

const shelfExpressionSchema: z.ZodType<ShelfExpression> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("group"),
      operator: z.enum(["and", "or"]),
      children: z.array(shelfExpressionSchema).min(1),
    }),
    z.object({
      type: z.literal("rule"),
      field: z.string().min(1),
      operator: z.enum(SHELF_RULE_OPERATORS),
      value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
    }),
  ]),
);

export const shelfExpressionSchemaExport = shelfExpressionSchema;

export const shelfMembershipExpressionSchema = shelfExpressionSchema.nullable();

export function isShelfExpression(value: unknown): value is ShelfExpression {
  return shelfExpressionSchema.safeParse(value).success;
}
