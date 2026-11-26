import { z } from "zod";
import { candidateSnapshotSchema } from "./club-reads.js";

export const selectionPhaseSchema = z.enum([
  "draft",
  "nominations_open",
  "nominations_closed",
  "voting_open",
  "completed",
  "cancelled",
]);
export const selectionMethodSchema = z.enum([
  "simple_poll",
  "ranked_choice",
  "random_draw",
]);
export const selectionConfigurationSchema = z.object({
  tieBehavior: z.enum(["runoff", "random", "moderator"]).default("moderator"),
  resultVisibility: z
    .enum(["after_completion", "during_voting"])
    .default("after_completion"),
  excludePreviouslyRead: z.boolean().default(false),
});
export const clubSelectionDefaultsSchema = z.object({
  nominationDays: z.number().int().min(1).max(90).default(7),
  votingDays: z.number().int().min(1).max(90).default(7),
  nominationLimit: z.number().int().min(1).max(100).default(2),
  method: selectionMethodSchema.default("simple_poll"),
  configuration: selectionConfigurationSchema.default({}),
});
export type ClubSelectionDefaults = z.infer<typeof clubSelectionDefaultsSchema>;
export const selectionRoundFieldsSchema = z.object({
  title: z.string().trim().min(1).max(300),
  method: selectionMethodSchema.default("simple_poll"),
  nominationStartsAt: z.string().datetime().nullable().optional(),
  nominationEndsAt: z.string().datetime().nullable().optional(),
  votingStartsAt: z.string().datetime().nullable().optional(),
  votingEndsAt: z.string().datetime().nullable().optional(),
  nextReadStartsAt: z.string().datetime().nullable().optional(),
  nominationLimit: z.number().int().min(1).max(100).default(2),
  configuration: selectionConfigurationSchema.default({}),
});
export const updateSelectionRoundSchema = selectionRoundFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export const createSelectionRoundSchema =
  selectionRoundFieldsSchema.superRefine((value, ctx) => {
    const dates = [
      value.nominationStartsAt,
      value.nominationEndsAt,
      value.votingStartsAt,
      value.votingEndsAt,
    ]
      .filter((date): date is string => !!date)
      .map((date) => new Date(date).getTime());
    if (dates.some((date, i) => i > 0 && date < dates[i - 1]!))
      ctx.addIssue({
        code: "custom",
        message: "Nomination and voting dates must be in chronological order",
      });
  });
export const nominateCandidateSchema = z
  .object({
    workSubjectType: z.enum(["book", "movie", "show", "ttrpg"]).default("book"),
    workSubjectId: z.string().min(1).max(200).optional(),
    snapshot: candidateSnapshotSchema.optional(),
    reason: z.string().trim().max(5000).optional(),
  })
  .refine(
    (value) => !!value.workSubjectId || !!value.snapshot,
    "A Work or external snapshot is required",
  );
export const ballotSchema = z
  .object({ ranking: z.array(z.string().uuid()).min(1).max(500) })
  .refine(
    (value) => new Set(value.ranking).size === value.ranking.length,
    "Candidates may only appear once on a ballot",
  );
export const finalizeSelectionSchema = z.object({
  candidateId: z.string().uuid().optional(),
});

export interface ElectionCount {
  counts: Record<string, number>;
  exhausted: number;
  eliminated: string | null;
}
export interface ElectionResult {
  method: "simple_poll" | "ranked_choice" | "random_draw";
  winnerId: string | null;
  tiedIds: string[];
  rounds: ElectionCount[];
  eligibleIds: string[];
  tieBreaks: { tiedIds: string[]; eliminated: string; rule: string }[];
}

/** Stable ID ordering breaks elimination ties reproducibly, and is recorded. */
export function instantRunoff(
  candidateIds: string[],
  ballots: string[][],
): ElectionResult {
  const eligibleIds = [...new Set(candidateIds)].sort();
  const remaining = new Set(eligibleIds);
  const rounds: ElectionCount[] = [];
  const tieBreaks: ElectionResult["tieBreaks"] = [];
  while (remaining.size) {
    const counts = Object.fromEntries([...remaining].map((id) => [id, 0]));
    let exhausted = 0;
    for (const ballot of ballots) {
      const choice = ballot.find((id) => remaining.has(id));
      if (choice) counts[choice]!++;
      else exhausted++;
    }
    const continuing = ballots.length - exhausted;
    const majority = [...remaining].find((id) => counts[id]! > continuing / 2);
    if (majority) {
      rounds.push({ counts, exhausted, eliminated: null });
      return {
        method: "ranked_choice",
        winnerId: majority,
        tiedIds: [],
        rounds,
        eligibleIds,
        tieBreaks,
      };
    }
    const minimum = Math.min(...Object.values(counts));
    const lowest = [...remaining].filter((id) => counts[id] === minimum).sort();
    // A complete tie requires the round's configured tie resolution, not a fabricated winner.
    if (lowest.length === remaining.size) {
      rounds.push({ counts, exhausted, eliminated: null });
      return {
        method: "ranked_choice",
        winnerId: null,
        tiedIds: lowest,
        rounds,
        eligibleIds,
        tieBreaks,
      };
    }
    const eliminated = lowest.at(-1)!;
    if (lowest.length > 1)
      tieBreaks.push({
        tiedIds: lowest,
        eliminated,
        rule: "eliminate_lexicographically_last_id",
      });
    rounds.push({ counts, exhausted, eliminated });
    remaining.delete(eliminated);
  }
  return {
    method: "ranked_choice",
    winnerId: null,
    tiedIds: [],
    rounds,
    eligibleIds,
    tieBreaks,
  };
}

export function simplePoll(
  candidateIds: string[],
  ballots: string[][],
): ElectionResult {
  const eligibleIds = [...new Set(candidateIds)].sort();
  const counts = Object.fromEntries(eligibleIds.map((id) => [id, 0]));
  let exhausted = 0;
  for (const ballot of ballots) {
    const id = ballot[0];
    if (id && id in counts) counts[id]!++;
    else exhausted++;
  }
  const max = Math.max(0, ...Object.values(counts));
  const tiedIds = eligibleIds.filter((id) => counts[id] === max);
  return {
    method: "simple_poll",
    winnerId: max > 0 && tiedIds.length === 1 ? tiedIds[0]! : null,
    tiedIds: tiedIds.length > 1 || max === 0 ? tiedIds : [],
    rounds: [{ counts, exhausted, eliminated: null }],
    eligibleIds,
    tieBreaks: [],
  };
}
