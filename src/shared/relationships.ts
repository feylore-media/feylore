import { z } from "zod";

export const relationshipEntityTypeSchema = z.enum(["book", "audiobook"]);
export type RelationshipEntityType = z.infer<typeof relationshipEntityTypeSchema>;

export const relationshipTypeSchema = z.enum([
  "related_edition",
  "adapted_from",
  "adapted_as",
  "based_on",
  "basis_for",
  "contains",
  "contained_in",
  "companion_to",
  "supplement_to",
  "supplemented_by",
  "spin_off_of",
  "has_spin_off",
  "sequel_to",
  "prequel_to",
  "related_to",
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const relatedGroupSchema = z.enum([
  "semantic",
  "people",
  "series",
  "representations",
]);
export type RelatedGroup = z.infer<typeof relatedGroupSchema>;

export const relatedGroupsQuerySchema = z.object({
  groups: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? [...new Set(value.split(",").map((group) => group.trim()).filter(Boolean))]
        : ["semantic"],
    )
    .pipe(z.array(relatedGroupSchema).min(1).max(4)),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.coerce.number().int().min(0).default(0),
});

export const relationshipTypeRegistry: Record<
  RelationshipType,
  { inverse: RelationshipType; symmetric?: boolean }
> = {
  related_edition: { inverse: "related_edition", symmetric: true },
  adapted_from: { inverse: "adapted_as" },
  adapted_as: { inverse: "adapted_from" },
  based_on: { inverse: "basis_for" },
  basis_for: { inverse: "based_on" },
  contains: { inverse: "contained_in" },
  contained_in: { inverse: "contains" },
  companion_to: { inverse: "companion_to", symmetric: true },
  supplement_to: { inverse: "supplemented_by" },
  supplemented_by: { inverse: "supplement_to" },
  spin_off_of: { inverse: "has_spin_off" },
  has_spin_off: { inverse: "spin_off_of" },
  sequel_to: { inverse: "prequel_to" },
  prequel_to: { inverse: "sequel_to" },
  related_to: { inverse: "related_to", symmetric: true },
};

export function inverseRelationshipType(type: RelationshipType): RelationshipType {
  return relationshipTypeRegistry[type].inverse;
}
