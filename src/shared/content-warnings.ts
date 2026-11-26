import { z } from "zod";

/** Shared metadata vocabulary; warnings may themselves reveal plot details. */
export const contentWarningSchema = z.object({
  code: z.enum([
    "violence",
    "sexual_violence",
    "abuse",
    "self_harm",
    "suicide",
    "animal_death",
    "child_harm",
    "discrimination",
    "drug_use",
    "graphic_medical_content",
  ]),
  provenance: z.object({
    source: z.enum(["provider", "user"]),
    sourceId: z.string().max(200).optional(),
  }),
});

export type ContentWarning = z.infer<typeof contentWarningSchema>;
