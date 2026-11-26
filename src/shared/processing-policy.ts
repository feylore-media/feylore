import { z } from "zod";
import type { MediaModuleId } from "./media-modules.js";

export const PROCESSING_MODULE_IDS = [
  "books",
  "comics",
  "movies",
  "tv",
  "audiobooks",
  "podcasts",
  "music",
] as const;

export type ProcessingModuleId = (typeof PROCESSING_MODULE_IDS)[number];

export const PROCESSING_CONVERSION_TARGETS = ["epub-3.3"] as const;
export type ProcessingConversionTarget =
  (typeof PROCESSING_CONVERSION_TARGETS)[number];

export const ARCHIVE_DESTINATION_INTENTS = ["originals", "archive"] as const;
export type ArchiveDestinationIntent =
  (typeof ARCHIVE_DESTINATION_INTENTS)[number];

export const DESTINATION_RESOLUTION_STATUSES = [
  "matched",
  "mono-directory",
  "ambiguous",
  "unresolved",
] as const;
export type DestinationResolutionStatus =
  (typeof DESTINATION_RESOLUTION_STATUSES)[number];

export interface ModuleProcessingPolicy {
  metadataProcessingEnabled: boolean;
  titleTemplate: string;
  pathTemplate: string;
  fileOperations: {
    renameFiles: boolean;
    organizeIntoLibrary: boolean;
  };
  conversion: {
    enabled: boolean;
    target: ProcessingConversionTarget | null;
  };
  readAlong?: {
    enabled: boolean;
  };
  originalRetention: {
    enabled: boolean;
    archiveFormat: "tar.gz";
    archiveDestinationIntent: ArchiveDestinationIntent | null;
  };
}

export interface ProcessingModuleDefinition {
  id: ProcessingModuleId;
  name: string;
  i18nKey: string;
  destinationIntent: string;
  ingestAvailable: boolean;
}

export const PROCESSING_MODULES: ProcessingModuleDefinition[] = [
  {
    id: "books",
    name: "Books",
    i18nKey: "processing.modules.books",
    destinationIntent: "books",
    ingestAvailable: true,
  },
  {
    id: "comics",
    name: "Comics",
    i18nKey: "processing.modules.comics",
    destinationIntent: "books",
    ingestAvailable: true,
  },
  {
    id: "movies",
    name: "Movies",
    i18nKey: "processing.modules.movies",
    destinationIntent: "movies",
    ingestAvailable: true,
  },
  {
    id: "tv",
    name: "TV Shows",
    i18nKey: "processing.modules.tv",
    destinationIntent: "tv",
    ingestAvailable: true,
  },
  {
    id: "audiobooks",
    name: "Audiobooks",
    i18nKey: "processing.modules.audiobooks",
    destinationIntent: "audiobooks",
    ingestAvailable: true,
  },
  {
    id: "podcasts",
    name: "Podcasts",
    i18nKey: "processing.modules.podcasts",
    destinationIntent: "podcasts",
    ingestAvailable: false,
  },
  {
    id: "music",
    name: "Music",
    i18nKey: "processing.modules.music",
    destinationIntent: "music",
    ingestAvailable: true,
  },
];

export const PROCESSING_TEMPLATE_FIELDS: Record<
  ProcessingModuleId,
  readonly string[]
> = {
  books: [
    "Authors",
    "Title",
    "SeriesName",
    "SeriesNumber",
    "SeriesTotal",
    "Published",
  ],
  comics: [
    "SeriesName",
    "SeriesNumber",
    "SeriesTotal",
    "ChapterNumber",
    "Title",
    "Authors",
    "Published",
  ],
  tv: [
    "SeriesName",
    "SeasonNumber",
    "EpisodeNumber",
    "Title",
    "Published",
  ],
  music: ["Authors", "SeriesName", "Title", "TrackNumber", "Published"],
  movies: ["Title", "Published", "Authors"],
  audiobooks: [
    "Authors",
    "Title",
    "SeriesName",
    "SeriesNumber",
    "Published",
  ],
  podcasts: ["Authors", "Title", "SeriesName", "SeriesNumber", "Published"],
};

export const DEFAULT_PATH_TEMPLATES: Record<ProcessingModuleId, string> = {
  books: "{Authors}/{SeriesName}/{Title}",
  comics: "{SeriesName}/Volume {SeriesNumber}/{Title}",
  movies: "{Title}",
  tv: "{SeriesName}/Season {SeasonNumber}",
  audiobooks: "{Authors}/{SeriesName}/{Title}",
  podcasts: "{SeriesName}/{Title}",
  music: "{Authors}/{SeriesName}/{Title}",
};

export const DEFAULT_TITLE_TEMPLATES: Record<ProcessingModuleId, string> = {
  books: "{Authors} - {Title} ({Published:yyyy})",
  comics: "{SeriesName} - v{SeriesNumber}",
  movies: "{Title} ({Published:yyyy})",
  tv: "{SeriesName} - S{SeasonNumber}E{EpisodeNumber} - {Title}",
  audiobooks: "{Authors} - {Title}",
  podcasts: "{Title}",
  music: "{Title}",
};

export const COMMON_TITLE_PRESETS: Record<ProcessingModuleId, string[]> = {
  books: [
    "{Authors} - {Title}",
    "{Title} ({Published:yyyy})",
    "{Authors} - {Title} ({Published:yyyy})",
    "{SeriesName} - v{SeriesNumber}",
  ],
  comics: [
    "{SeriesName} - v{SeriesNumber} - {Title} - {Authors}",
    "{SeriesName} - v{SeriesNumber}",
    "{SeriesName} - c{ChapterNumber} - {Title}",
    "{Title}",
  ],
  movies: ["{Title}", "{Title} ({Published:yyyy})"],
  tv: [
    "{SeriesName} - S{SeasonNumber}E{EpisodeNumber} - {Title}",
    "{SeriesName} - S{SeasonNumber}E{EpisodeNumber}",
  ],
  audiobooks: ["{Authors} - {Title}", "{Title}"],
  podcasts: ["{Title}", "{SeriesName}/{Title}"],
  music: ["{Title}", "{Authors} - {Title}"],
};

export const COMMON_PATH_PRESETS: Record<ProcessingModuleId, string[]> = {
  books: ["{Authors}/{SeriesName}/{Title}", "{Authors}/{Title}"],
  comics: [
    "{SeriesName}/Volume {SeriesNumber}/{Title}",
    "{SeriesName}/{Title}",
  ],
  movies: ["{Title}"],
  tv: ["{SeriesName}/Season {SeasonNumber}"],
  audiobooks: ["{Authors}/{SeriesName}/{Title}", "{Authors}/{Title}"],
  podcasts: ["{SeriesName}/{Title}"],
  music: ["{Authors}/{SeriesName}/{Title}"],
};

export function isProcessingModuleId(
  value: string,
): value is ProcessingModuleId {
  return (PROCESSING_MODULE_IDS as readonly string[]).includes(value);
}

export function getProcessingModuleDefinition(
  id: ProcessingModuleId,
): ProcessingModuleDefinition {
  const def = PROCESSING_MODULES.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown processing module: ${id}`);
  return def;
}

export function getDestinationIntent(
  moduleId: ProcessingModuleId,
): string {
  return getProcessingModuleDefinition(moduleId).destinationIntent;
}

/** Which processing modules are shown given enabled MediaModuleId values. */
export function resolveEnabledProcessingModules(
  enabledMediaModules: readonly MediaModuleId[],
): ProcessingModuleId[] {
  const enabled = new Set(enabledMediaModules);
  const result: ProcessingModuleId[] = [];
  if (enabled.has("books")) result.push("books");
  if (enabled.has("comics")) result.push("comics");
  if (enabled.has("video")) {
    result.push("movies", "tv");
  }
  if (enabled.has("audiobooks")) {
    result.push("audiobooks", "podcasts");
  }
  if (enabled.has("music")) result.push("music");
  return result;
}

export function createDefaultPolicy(
  moduleId: ProcessingModuleId,
): ModuleProcessingPolicy {
  const conversionEnabled = moduleId === "books";
  return {
    metadataProcessingEnabled: true,
    titleTemplate: DEFAULT_TITLE_TEMPLATES[moduleId],
    pathTemplate: DEFAULT_PATH_TEMPLATES[moduleId],
    fileOperations: {
      renameFiles: true,
      organizeIntoLibrary: true,
    },
    conversion: {
      enabled: conversionEnabled,
      target: conversionEnabled ? "epub-3.3" : null,
    },
    ...(moduleId === "books" ? { readAlong: { enabled: false } } : {}),
    originalRetention: {
      enabled: false,
      archiveFormat: "tar.gz",
      archiveDestinationIntent: null,
    },
  };
}

const fileOperationsSchema = z.object({
  renameFiles: z.boolean(),
  organizeIntoLibrary: z.boolean(),
});

const conversionSchema = z.object({
  enabled: z.boolean(),
  target: z.enum(PROCESSING_CONVERSION_TARGETS).nullable(),
});

const originalRetentionSchema = z.object({
  enabled: z.boolean(),
  archiveFormat: z.literal("tar.gz"),
  archiveDestinationIntent: z
    .enum(ARCHIVE_DESTINATION_INTENTS)
    .nullable(),
});

const readAlongSchema = z.object({
  enabled: z.boolean(),
});

export const moduleProcessingPolicySchema = z.object({
  metadataProcessingEnabled: z.boolean(),
  titleTemplate: z.string().min(1),
  pathTemplate: z.string().min(1),
  fileOperations: fileOperationsSchema,
  conversion: conversionSchema,
  readAlong: readAlongSchema.optional(),
  originalRetention: originalRetentionSchema,
});

export const patchProcessingPolicySchema = moduleProcessingPolicySchema
  .partial()
  .superRefine((body, ctx) => {
    if (body.readAlong !== undefined) {
      // readAlong validated per-module in service
    }
    if (
      body.conversion?.enabled === true &&
      body.conversion.target === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "conversion.target required when conversion is enabled",
        path: ["conversion", "target"],
      });
    }
  });

export function normalizePolicy(
  moduleId: ProcessingModuleId,
  partial: Partial<ModuleProcessingPolicy> | undefined,
): ModuleProcessingPolicy {
  const defaults = createDefaultPolicy(moduleId);
  if (!partial) return defaults;
  const merged: ModuleProcessingPolicy = {
    ...defaults,
    ...partial,
    fileOperations: {
      ...defaults.fileOperations,
      ...partial.fileOperations,
    },
    conversion: {
      ...defaults.conversion,
      ...partial.conversion,
    },
    originalRetention: {
      ...defaults.originalRetention,
      ...partial.originalRetention,
    },
  };
  if (moduleId === "books") {
    merged.readAlong = {
      enabled: partial.readAlong?.enabled ?? defaults.readAlong?.enabled ?? false,
    };
  } else {
    delete merged.readAlong;
  }
  if (!merged.conversion.enabled) {
    merged.conversion.target = null;
  }
  return merged;
}
