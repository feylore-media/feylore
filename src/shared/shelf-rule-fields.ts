import type { ShelfRuleOperator } from "./shelf-expression.js";
import { SHELF_RULE_OPERATORS } from "./shelf-expression.js";
import type { WorkSubjectType } from "./subject.js";
import { WORK_SUBJECT_TYPES } from "./subject.js";
import type { ShelfScopeId } from "./shelf-scopes.js";
import { subjectTypesForShelfScope } from "./shelf-scopes.js";

export const SHELF_RULE_FIELD_IDS = [
  "title",
  "creator",
  "genre",
  "favorite",
  "addedAt",
  "status",
  "collection",
] as const;

export type ShelfRuleFieldId = (typeof SHELF_RULE_FIELD_IDS)[number];

export const SHELF_READING_STATUSES = [
  "unread",
  "in_progress",
  "completed",
] as const;

export type ShelfReadingStatus = (typeof SHELF_READING_STATUSES)[number];

const PROGRESS_TYPES: WorkSubjectType[] = [
  "book",
  "audiobook",
  "movie",
  "show",
  "tv_episode",
  "podcast_episode",
];

export interface ShelfRuleFieldDefinition {
  id: ShelfRuleFieldId;
  label: string;
  applicableSubjectTypes: readonly WorkSubjectType[];
  operators: readonly ShelfRuleOperator[];
}

const TEXT_OPS: ShelfRuleOperator[] = ["contains", "eq"];
const EQ_OPS: ShelfRuleOperator[] = ["eq", "neq"];
const DATE_OPS: ShelfRuleOperator[] = ["eq", "gt", "gte", "lt", "lte"];

export const SHELF_RULE_FIELDS: ShelfRuleFieldDefinition[] = [
  {
    id: "title",
    label: "Title",
    applicableSubjectTypes: WORK_SUBJECT_TYPES,
    operators: TEXT_OPS,
  },
  {
    id: "creator",
    label: "Creator",
    applicableSubjectTypes: [
      "book",
      "audiobook",
      "album",
      "track",
      "artist",
      "movie",
      "show",
      "podcast",
    ],
    operators: TEXT_OPS,
  },
  {
    id: "genre",
    label: "Genre",
    applicableSubjectTypes: [
      "book",
      "audiobook",
      "album",
      "track",
      "movie",
      "show",
      "podcast",
    ],
    operators: ["eq", "contains", "in"],
  },
  {
    id: "favorite",
    label: "Favorite",
    applicableSubjectTypes: WORK_SUBJECT_TYPES,
    operators: ["eq"],
  },
  {
    id: "addedAt",
    label: "Date added",
    applicableSubjectTypes: WORK_SUBJECT_TYPES,
    operators: DATE_OPS,
  },
  {
    id: "status",
    label: "Status",
    applicableSubjectTypes: PROGRESS_TYPES,
    operators: EQ_OPS,
  },
  {
    id: "collection",
    label: "Collection",
    applicableSubjectTypes: ["book", "movie"],
    operators: TEXT_OPS,
  },
];

const FIELD_MAP = new Map(SHELF_RULE_FIELDS.map((f) => [f.id, f]));

export function getShelfRuleField(
  fieldId: string,
): ShelfRuleFieldDefinition | undefined {
  return FIELD_MAP.get(fieldId as ShelfRuleFieldId);
}

export function isFieldApplicableToSubjectType(
  fieldId: string,
  subjectType: string,
): boolean {
  const field = getShelfRuleField(fieldId);
  if (!field) return false;
  return field.applicableSubjectTypes.includes(subjectType as WorkSubjectType);
}

export function getRuleFieldsForScope(
  scope: ShelfScopeId,
): ShelfRuleFieldDefinition[] {
  const types = new Set(subjectTypesForShelfScope(scope));
  return SHELF_RULE_FIELDS.filter((f) =>
    f.applicableSubjectTypes.some((t) => types.has(t)),
  );
}
