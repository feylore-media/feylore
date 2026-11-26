/** Metadata-configuration media modules (not shell nav items). */
export const MEDIA_MODULE_IDS = [
  "books",
  "comics",
  "audiobooks",
  "music",
  "video",
  "people",
] as const;

export type MediaModuleId = (typeof MEDIA_MODULE_IDS)[number];

export const DEFAULT_ENABLED_MODULES: MediaModuleId[] = [
  "books",
  "comics",
  "audiobooks",
  "music",
  "video",
  "people",
];

export interface MediaModuleDefinition {
  id: MediaModuleId;
  name: string;
  i18nKey: string;
}

export const MEDIA_MODULES: MediaModuleDefinition[] = [
  { id: "books", name: "Books", i18nKey: "modules.books" },
  { id: "comics", name: "Comics", i18nKey: "modules.comics" },
  { id: "audiobooks", name: "Audiobooks", i18nKey: "modules.audiobooks" },
  { id: "music", name: "Music", i18nKey: "modules.music" },
  { id: "video", name: "Video", i18nKey: "modules.video" },
  { id: "people", name: "People", i18nKey: "modules.people" },
];

export function isMediaModuleId(value: string): value is MediaModuleId {
  return (MEDIA_MODULE_IDS as readonly string[]).includes(value);
}

/** Maps shell nav keys to metadata module IDs where they differ. */
export const SHELL_NAV_TO_MEDIA_MODULE: Record<string, MediaModuleId | null> =
  {
    books: "books",
    audiobooks: "audiobooks",
    music: "music",
    movies: "video",
    tv: "video",
    photos: null,
    ttrpg: null,
  };
