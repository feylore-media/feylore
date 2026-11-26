/** Domain Work types (schema.org CreativeWork subclasses). */
export const WORK_SUBJECT_TYPES = [
  "book",
  "audiobook",
  "podcast",
  "podcast_episode",
  "album",
  "track",
  "artist",
  "movie",
  "show",
  "tv_episode",
  "photo",
  "ttrpg",
] as const;

export type WorkSubjectType = (typeof WORK_SUBJECT_TYPES)[number];

/** WEM bibliographic layers (not including Representation). */
export const BIBLIOGRAPHIC_SUBJECT_TYPES = [
  "expression",
  "manifestation",
] as const;

export type BibliographicSubjectType =
  (typeof BIBLIOGRAPHIC_SUBJECT_TYPES)[number];

/** Feylore application layer (not WEM). */
export const APPLICATION_SUBJECT_TYPES = [
  "representation",
  "live_tv_channel",
] as const;

export type ApplicationSubjectType =
  (typeof APPLICATION_SUBJECT_TYPES)[number];

export const SUBJECT_TYPES = [
  ...WORK_SUBJECT_TYPES,
  ...BIBLIOGRAPHIC_SUBJECT_TYPES,
  ...APPLICATION_SUBJECT_TYPES,
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type SubjectRef = {
  type: SubjectType;
  id: string;
};

/** Targets for library_memberships — normally a Work. */
export const LIBRARY_MEMBERSHIP_TARGET_TYPES = [
  ...WORK_SUBJECT_TYPES,
  ...BIBLIOGRAPHIC_SUBJECT_TYPES,
  ...APPLICATION_SUBJECT_TYPES,
] as const;

export type LibraryMembershipTargetType =
  (typeof LIBRARY_MEMBERSHIP_TARGET_TYPES)[number];

export const REPRESENTATION_FORMATS = [
  "epub",
  "pdf",
  "cbz",
  "cbr",
  "mobi",
  "azw3",
  "audio",
  "other",
] as const;

export type RepresentationFormat =
  (typeof REPRESENTATION_FORMATS)[number];

export function inferFormatFromPath(
  relativePath: string,
): RepresentationFormat {
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "epub":
      return "epub";
    case "pdf":
      return "pdf";
    case "cbz":
      return "cbz";
    case "cbr":
      return "cbr";
    case "mobi":
      return "mobi";
    case "azw3":
    case "azw":
      return "azw3";
    case "mp3":
    case "m4b":
    case "m4a":
    case "flac":
    case "ogg":
      return "audio";
    default:
      return "other";
  }
}

export function titleFromPath(relativePath: string): string {
  const basename = relativePath.split(/[/\\]/).pop() ?? relativePath;
  const withoutExt = basename.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/[-_.]+/g, " ").trim() || basename;
}
