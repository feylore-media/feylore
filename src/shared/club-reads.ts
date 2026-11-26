import { z } from "zod";

export { contentWarningSchema } from "./content-warnings.js";
export { mediaLocationSchema, type MediaLocation } from "./media-location.js";
import { contentWarningSchema } from "./content-warnings.js";

export const candidateSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(500),
  authors: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  subtitle: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  coverFileId: z.string().uuid().nullable().optional(),
  isbn13: z
    .string()
    .regex(/^\d{13}$/)
    .optional(),
  isbn10: z
    .string()
    .regex(/^\d{9}[\dXx]$/)
    .optional(),
  publicationDate: z.string().max(30).optional(),
  publisher: z.string().max(500).optional(),
  language: z.string().max(100).optional(),
  pageCount: z.number().int().positive().optional(),
  genres: z.array(z.string().max(200)).max(100).default([]),
  series: z.string().max(500).optional(),
  seriesPosition: z.number().nonnegative().optional(),
  contentWarnings: z.array(contentWarningSchema).max(100).default([]),
  providerIdentifiers: z
    .record(z.string().max(100), z.string().max(500))
    .default({}),
  provenance: z
    .array(
      z.object({
        source: z.enum(["provider", "user", "work"]),
        sourceId: z.string().max(500).optional(),
      }),
    )
    .max(100)
    .default([]),
});
export type CandidateSnapshot = z.infer<typeof candidateSnapshotSchema>;

export const clubReadStatusSchema = z.enum([
  "scheduled",
  "active",
  "completed",
  "cancelled",
]);
export type ClubReadStatus = z.infer<typeof clubReadStatusSchema>;
export const createClubReadSchema = z
  .object({
    workSubjectType: z.enum(["book", "movie", "show", "ttrpg"]).default("book"),
    workSubjectId: z.string().min(1).max(200).nullable().optional(),
    candidateSnapshot: candidateSnapshotSchema.optional(),
    status: clubReadStatusSchema.default("scheduled"),
    startDate: z.string().datetime().nullable().optional(),
    targetEndDate: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.workSubjectId && !value.candidateSnapshot)
      ctx.addIssue({
        code: "custom",
        message: "A Work or candidate snapshot is required",
      });
    if (
      value.startDate &&
      value.targetEndDate &&
      value.targetEndDate < value.startDate
    )
      ctx.addIssue({
        code: "custom",
        message: "End date must follow start date",
      });
  });
export const updateClubReadSchema = z
  .object({
    status: clubReadStatusSchema.optional(),
    startDate: z.string().datetime().nullable().optional(),
    targetEndDate: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export interface ClubRead {
  id: string;
  clubId: string;
  workSubjectType: string;
  workSubjectId: string | null;
  candidateSnapshot: CandidateSnapshot | null;
  status: ClubReadStatus;
  startDate: string | null;
  targetEndDate: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  selectionRoundId: string | null;
  legacyClubWorkId: string | null;
}
