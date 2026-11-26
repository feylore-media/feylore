import type { ClubRead, CandidateSnapshot } from "./club-reads.js";
import type { ConsumptionTarget } from "./clubs.js";
import type { ProgressLocator } from "./progress-locator.js";
import type { RatingDimension } from "./ratings.js";
import type { ProfileCosmetics } from "./profile-cosmetics.js";

export interface SafeClubItem {
  id: string;
  kind:
    "discussion" | "passage" | "checkin" | "nomination" | "selection" | "read";
  label: string;
  text: string | null;
  locked: boolean;
  author: string | null;
  createdAt: string;
  href: string | null;
  unread: boolean;
}
export interface ClubEvent {
  id: string;
  clubId: string;
  clubReadId: string | null;
  kind:
    | "club_read_start"
    | "club_read_end"
    | "checkin"
    | "nomination_open"
    | "nomination_close"
    | "voting_open"
    | "voting_close"
    | "final_discussion";
  startsAt: string;
  label: string;
  href: string;
}
export interface ReadSummary {
  read: ClubRead;
  snapshot: CandidateSnapshot;
  workHref: string | null;
  readerHref: string | null;
  participantCount: number;
  discussionCount: number;
  journalCount: number;
  averageRating: number | null;
  ratingCount: number;
  recommendations: number | null;
}
export interface ReadExperience extends ReadSummary {
  viewerProgress: ProgressLocator | null;
  progressPercent: number | null;
  progressLabel: string | null;
  caughtUp: boolean | null;
  viewerCheckedIn: boolean;
  caughtUpCount: number;
  memberCount: number;
  members: { userId: string; displayName: string; checkedIn: boolean; cosmetics?: ProfileCosmetics | null }[];
  checkIn: {
    id: string;
    consumption: ConsumptionTarget;
    label: string;
    scheduledAt: string;
    topicHref: string | null;
    available: boolean;
  } | null;
  schedule: {
    id: string;
    label: string;
    scheduledAt: string;
    status: string;
    href: string | null;
  }[];
  discussions: SafeClubItem[];
  journal: SafeClubItem[];
  participants: { userId: string; displayName: string; cosmetics?: ProfileCosmetics | null }[];
  rating: {
    coreValues: Record<string, number>;
    genreValues: Record<string, Record<string, number>>;
    trajectory: { progress: number; rating: number }[];
    dimensions: RatingDimension[];
    scale: number;
  };
  viewerRatingStatus: string | null;
}
export interface SelectionSummary {
  id: string;
  title: string;
  phase: string;
  method: string;
  nominationEndsAt: string | null;
  votingStartsAt: string | null;
  votingEndsAt: string | null;
  candidateCount: number;
  nominatorCount: number;
  votedCount: number;
  remainingNominations: number;
  hasBallot: boolean;
  winner: CandidateSnapshot | null;
  nextReadStartsAt: string | null;
  href: string;
}
export interface ClubExperienceOverview {
  activeRead: ReadExperience | null;
  selection: SelectionSummary | null;
  upcoming: ClubEvent[];
  recentActivity: SafeClubItem[];
  lastRead: ReadSummary | null;
}
