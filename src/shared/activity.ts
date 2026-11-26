export const ACTIVITY_TYPES = {
  BOOK_FAVORITED: "book.favorited",
  BOOK_UNFAVORITED: "book.unfavorited",
  BOOK_RATED: "book.rated",
  BOOK_RATING_CLEARED: "book.rating_cleared",
  BOOK_REVIEW_SAVED: "book.review_saved",
  BOOK_REVIEW_UPDATED: "book.review_updated",
  BOOK_REVIEW_REMOVED: "book.review_removed",
  BOOK_REVIEW_POSTED: "book.review_posted",
  BOOK_PROGRESS_UPDATED: "book.progress_updated",
  BOOK_READING_STARTED: "book.reading_started",
  BOOK_READING_FINISHED: "book.reading_finished",
  AUDIOBOOK_FAVORITED: "audiobook.favorited",
  AUDIOBOOK_UNFAVORITED: "audiobook.unfavorited",
  AUDIOBOOK_RATED: "audiobook.rated",
  AUDIOBOOK_RATING_CLEARED: "audiobook.rating_cleared",
  LISTENING_STARTED: "listening.started",
  LISTENING_PROGRESS_UPDATED: "listening.progress_updated",
  LISTENING_FINISHED: "listening.finished",
  DOWNLOAD_REQUESTED: "download.requested",
  DOWNLOAD_REMOVED: "download.removed",
  ACHIEVEMENT_EARNED: "achievement.earned",
  CHALLENGE_CREATED: "challenge.created",
  CHALLENGE_JOINED: "challenge.joined",
  CHALLENGE_LEFT: "challenge.left",
  CHALLENGE_STARTED: "challenge.started",
  CHALLENGE_MILESTONE: "challenge.milestone",
  CHALLENGE_COMPLETED: "challenge.completed",
  CHALLENGE_ENDED: "challenge.ended",
  CHALLENGE_CANCELLED: "challenge.cancelled",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export type ActivityVisibility = "private" | "friends" | "public";

export interface ActivityEventPublic {
  id: string;
  type: ActivityType | string;
  subjectType: string | null;
  subjectId: string | null;
  visibility: ActivityVisibility;
  payload: Record<string, unknown> | null;
  createdAt: string;
}
