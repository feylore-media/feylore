import type { WorkSubjectType } from "./subject.js";
import { WORK_SUBJECT_TYPES } from "./subject.js";

/** Shelf scope identifiers — global plus shell media nav keys. */
export const SHELF_SCOPE_IDS = [
  "global",
  "books",
  "audiobooks",
  "music",
  "movies",
  "tv",
  "podcasts",
  "photos",
  "ttrpg",
] as const;

export type ShelfScopeId = (typeof SHELF_SCOPE_IDS)[number];

export interface ShelfScopeDefinition {
  id: ShelfScopeId;
  i18nKey: string;
  shellNavKey: string | null;
  subjectTypes: readonly WorkSubjectType[];
}

const BOOK_TYPES: WorkSubjectType[] = ["book"];
const AUDIOBOOK_TYPES: WorkSubjectType[] = ["audiobook"];
const MUSIC_TYPES: WorkSubjectType[] = ["album", "track", "artist"];
const MOVIE_TYPES: WorkSubjectType[] = ["movie"];
const TV_TYPES: WorkSubjectType[] = ["show", "tv_episode"];
const PODCAST_TYPES: WorkSubjectType[] = ["podcast", "podcast_episode"];
const PHOTO_TYPES: WorkSubjectType[] = ["photo"];
const TTRPG_TYPES: WorkSubjectType[] = ["ttrpg"];

export const SHELF_SCOPES: ShelfScopeDefinition[] = [
  {
    id: "global",
    i18nKey: "scopes.global",
    shellNavKey: null,
    subjectTypes: WORK_SUBJECT_TYPES,
  },
  {
    id: "books",
    i18nKey: "scopes.books",
    shellNavKey: "books",
    subjectTypes: BOOK_TYPES,
  },
  {
    id: "audiobooks",
    i18nKey: "scopes.audiobooks",
    shellNavKey: "audiobooks",
    subjectTypes: AUDIOBOOK_TYPES,
  },
  {
    id: "music",
    i18nKey: "scopes.music",
    shellNavKey: "music",
    subjectTypes: MUSIC_TYPES,
  },
  {
    id: "movies",
    i18nKey: "scopes.movies",
    shellNavKey: "movies",
    subjectTypes: MOVIE_TYPES,
  },
  {
    id: "tv",
    i18nKey: "scopes.tv",
    shellNavKey: "tv",
    subjectTypes: TV_TYPES,
  },
  {
    id: "podcasts",
    i18nKey: "scopes.podcasts",
    shellNavKey: "audiobooks",
    subjectTypes: PODCAST_TYPES,
  },
  {
    id: "photos",
    i18nKey: "scopes.photos",
    shellNavKey: "photos",
    subjectTypes: PHOTO_TYPES,
  },
  {
    id: "ttrpg",
    i18nKey: "scopes.ttrpg",
    shellNavKey: "ttrpg",
    subjectTypes: TTRPG_TYPES,
  },
];

const SCOPE_MAP = new Map(SHELF_SCOPES.map((s) => [s.id, s]));

export function isShelfScopeId(value: string): value is ShelfScopeId {
  return (SHELF_SCOPE_IDS as readonly string[]).includes(value);
}

export function getShelfScopeDefinition(
  scope: ShelfScopeId,
): ShelfScopeDefinition {
  const def = SCOPE_MAP.get(scope);
  if (!def) throw new Error(`Unknown shelf scope: ${scope}`);
  return def;
}

export function subjectTypesForShelfScope(
  scope: ShelfScopeId,
): readonly WorkSubjectType[] {
  return getShelfScopeDefinition(scope).subjectTypes;
}

export function isSubjectEligibleForScope(
  subjectType: string,
  scope: ShelfScopeId,
): boolean {
  return subjectTypesForShelfScope(scope).includes(
    subjectType as WorkSubjectType,
  );
}

/** A shelf is visible in domain context D when scope is global or matches D. */
export function isShelfVisibleInScope(
  shelfScope: ShelfScopeId,
  contextScope: ShelfScopeId,
): boolean {
  if (shelfScope === "global") return true;
  return shelfScope === contextScope;
}

export function globalScopeIncludes(subjectType: string): boolean {
  return WORK_SUBJECT_TYPES.includes(subjectType as WorkSubjectType);
}
