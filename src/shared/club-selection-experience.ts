import type { CandidateSnapshot } from "./club-reads.js";
import type { ElectionResult } from "./club-selection.js";
import type { ProfileCosmetics } from "./profile-cosmetics.js";

export interface SelectionCandidateSummary {
  id: string;
  workSubjectType: string;
  workSubjectId: string | null;
  snapshot: Omit<CandidateSnapshot, "description" | "contentWarnings"> & {
    hasContentWarnings: boolean;
  };
  eligible: boolean;
  availableToRead: boolean;
  nominationCount: number;
  nominators: {
    displayName: string;
    reason: string | null;
    cosmetics?: ProfileCosmetics | null;
  }[];
}
export interface SelectionCandidateDetail extends Omit<
  SelectionCandidateSummary,
  "snapshot"
> {
  snapshot: CandidateSnapshot;
  workHref: string | null;
  readerHref: string | null;
  warningSources: Record<string, string>;
}
export interface SelectionAudit extends ElectionResult {
  decidedAt: string;
  clubReadId?: string;
  runoffRoundId?: string;
  requiresTieResolution?: boolean;
  tieResolution?: string | null;
  configuration: Record<string, unknown>;
}
export interface SelectionExperience {
  id: string;
  title: string;
  phase:
    | "draft"
    | "nominations_open"
    | "nominations_closed"
    | "voting_open"
    | "completed"
    | "cancelled";
  method: "simple_poll" | "ranked_choice" | "random_draw";
  nominationStartsAt: string | null;
  nominationEndsAt: string | null;
  votingStartsAt: string | null;
  votingEndsAt: string | null;
  nextReadStartsAt: string | null;
  nominationLimit: number;
  configuration: {
    tieBehavior: "runoff" | "random" | "moderator";
    resultVisibility: "after_completion" | "during_voting";
    excludePreviouslyRead: boolean;
  };
  source: { name: string; ruleSummary: string | null } | null;
  candidateCount: number;
  eligibleCount: number;
  nominationCount: number;
  nominatorCount: number;
  memberCount: number;
  remainingNominations: number;
  votedCount: number;
  viewerBallot: string[];
  viewerChoices: { id: string; title: string }[];
  canNominate: boolean;
  canVote: boolean;
  canModerate: boolean;
  isMember: boolean;
  resultVisible: boolean;
  result: {
    winner: { id: string; snapshot: CandidateSnapshot } | null;
    decidedAt: string;
    eligibleCount: number;
    clubReadId: string | null;
    runoffRoundId: string | null;
    requiresTieResolution: boolean;
    tiedIds: string[];
    tieResolution: string | null;
  } | null;
  parentRoundId: string | null;
  candidates: SelectionCandidateSummary[];
  nextCursor: string | null;
}
