import type { ProfileCosmetics } from "./profile-cosmetics.js";

export interface ClubMemberPresence {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  cosmetics?: ProfileCosmetics | null;
  joinedAt: string;
  progress: {
    state: "not_started" | "reading" | "finished" | "private" | "unknown";
    percent: number | null;
    chapter: number | null;
    page: number | null;
  };
  checkIn: "caught_up" | "not_yet" | null;
  readCount: number;
  completedCount: number;
}

export interface ClubMembersExperience {
  activeRead: { id: string; title: string } | null;
  members: ClubMemberPresence[];
}

export interface ClubMemberExperience {
  member: ClubMemberPresence;
  recentReads: {
    id: string;
    title: string;
    completedAt: string | null;
    rating: number | null;
  }[];
  nextCursor: string | null;
  sharedPassages: number;
  discussions: number;
}

import type { GenreRatingDefinition, RatingDimension } from "./ratings.js";

export interface ClubStatsExperience {
  since: string | null;
  summary: {
    reads: number;
    distinctWorks: number;
    rereads: number;
    knownPages: number | null;
    pageCountKnown: number;
  };
  length: {
    median: number | null;
    average: number | null;
    shortest: number | null;
    longest: number | null;
  };
  pace: {
    medianDays: number | null;
    averageDays: number | null;
    datedReads: number;
  };
  participation: {
    typicalParticipants: number | null;
    participantOccurrences: number;
    completedParticipantOccurrences: number;
    checkInParticipantOccurrences: number;
    discussionParticipantOccurrences: number;
  };
  genres: { name: string; reads: number }[];
  ratings: {
    average: number | null;
    count: number;
    distribution: { rating: number; count: number }[];
    coreValues: Record<string, number>;
    genreValues: Record<string, Record<string, number>>;
    trajectory: { progress: number; rating: number }[];
    dimensions: RatingDimension[];
    genreDefinitions: GenreRatingDefinition[];
    scale: number;
  };
  recommendations: { yes: number; total: number };
  overTime: { month: string; reads: number }[];
  highlights: {
    highestRated: { readId: string; title: string; rating: number } | null;
    divisive: {
      readId: string;
      title: string;
      standardDeviation: number;
    } | null;
  };
}
