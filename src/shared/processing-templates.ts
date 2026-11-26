import {
  PROCESSING_TEMPLATE_FIELDS,
  type ProcessingModuleId,
} from "./processing-policy.js";

export type TemplateRenderMode = "title" | "path";

export interface ProcessingTemplateMetadata {
  title?: string | null;
  authors?: string[] | null;
  series?: string | null;
  seriesNumber?: string | number | null;
  seriesTotal?: string | number | null;
  chapterNumber?: string | number | null;
  seasonNumber?: string | number | null;
  episodeNumber?: string | number | null;
  trackNumber?: string | number | null;
  publicationDate?: string | Date | null;
  artist?: string | null;
  album?: string | null;
}

const PLACEHOLDER_RE = /\{([A-Za-z][A-Za-z0-9]*)(?::([^}]+))?\}/g;

const FIELD_ALIASES: Record<string, keyof ProcessingTemplateMetadata> = {
  Authors: "authors",
  authors: "authors",
  Title: "title",
  title: "title",
  SeriesName: "series",
  series: "series",
  SeriesNumber: "seriesNumber",
  seriesnumber: "seriesNumber",
  SeriesTotal: "seriesTotal",
  seriestotal: "seriesTotal",
  ChapterNumber: "chapterNumber",
  chapternumber: "chapterNumber",
  SeasonNumber: "seasonNumber",
  seasonnumber: "seasonNumber",
  EpisodeNumber: "episodeNumber",
  episodenumber: "episodeNumber",
  TrackNumber: "trackNumber",
  tracknumber: "trackNumber",
  Published: "publicationDate",
  published: "publicationDate",
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const INVALID_PATH_CHARS = /[<>:"\\|?*\x00-\x1f]/g;

export function extractTemplateFields(template: string): string[] {
  const fields: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((match = re.exec(template)) !== null) {
    fields.push(match[1]!);
  }
  return fields;
}

export function validateTemplateFields(
  moduleId: ProcessingModuleId,
  template: string,
): string | null {
  const allowed = new Set(PROCESSING_TEMPLATE_FIELDS[moduleId]);
  for (const field of extractTemplateFields(template)) {
    if (!allowed.has(field)) {
      return `Unsupported field {${field}} for module ${moduleId}`;
    }
  }
  if (/\.\./.test(template)) {
    return "Path traversal (..) is not allowed";
  }
  if (/^[a-zA-Z]:[\\/]/.test(template) || template.startsWith("\\\\")) {
    return "Absolute paths are not allowed";
  }
  return null;
}

function formatDate(value: string | Date, format: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = /^\d{4}-\d{2}-\d{2}/.test(String(value))
    ? date.getUTCFullYear()
    : date.getFullYear();
  if (format === "yyyy") return String(year);
  if (format === "yyyy-MM") {
    const month = /^\d{4}-\d{2}-\d{2}/.test(String(value))
      ? date.getUTCMonth() + 1
      : date.getMonth() + 1;
    const m = String(month).padStart(2, "0");
    return `${year}-${m}`;
  }
  return String(year);
}

function resolveFieldValue(
  fieldName: string,
  format: string | undefined,
  metadata: ProcessingTemplateMetadata,
  moduleId: ProcessingModuleId,
): string {
  const key = FIELD_ALIASES[fieldName];
  if (!key) return "";

  if (key === "authors") {
    const authors = metadata.authors;
    if (!authors?.length) {
      if (moduleId === "music" && metadata.artist) return metadata.artist;
      return "";
    }
    return authors.join(", ");
  }

  if (key === "series" && moduleId === "music" && metadata.album) {
    return metadata.album;
  }

  const raw = metadata[key];
  if (raw === null || raw === undefined || raw === "") return "";

  if (key === "publicationDate") {
    return formatDate(raw as string | Date, format ?? "yyyy");
  }

  return String(raw);
}

function slugifySegment(value: string, mode: TemplateRenderMode): string {
  const cleaned = value
    .trim()
    .replace(mode === "title" ? INVALID_FILENAME_CHARS : INVALID_PATH_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned;
}

type TemplatePart =
  | { kind: "literal"; value: string }
  | { kind: "field"; name: string; format?: string };

function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        kind: "literal",
        value: template.slice(lastIndex, match.index),
      });
    }
    parts.push({
      kind: "field",
      name: match[1]!,
      format: match[2],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < template.length) {
    parts.push({ kind: "literal", value: template.slice(lastIndex) });
  }
  return parts;
}

function isSeparatorLiteral(value: string, mode: TemplateRenderMode): boolean {
  if (mode === "path") return value === "/";
  return /^[\s\-–—/|,;:()]*$/.test(value) && value.trim().length <= 3;
}

function cleanupTitle(value: string): string {
  let result = value;
  result = result.replace(/\s+-\s+-\s+/g, " - ");
  result = result.replace(/\(\s*\)/g, "");
  result = result.replace(/\s+-\s*$/g, "");
  result = result.replace(/^\s*-\s+/g, "");
  result = result.replace(/\s{2,}/g, " ");
  return result.trim();
}

function cleanupPath(value: string): string {
  const segments = value
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.join("/");
}

export function renderTemplate(
  template: string,
  metadata: ProcessingTemplateMetadata,
  moduleId: ProcessingModuleId,
  mode: TemplateRenderMode,
): string {
  const parts = parseTemplate(template);
  let result = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.kind === "literal") {
      const next = parts[i + 1];
      const prev = parts[i - 1];
      if (
        next?.kind === "field" &&
        !resolveFieldValue(next.name, next.format, metadata, moduleId)
      ) {
        if (isSeparatorLiteral(part.value, mode)) continue;
      }
      if (
        prev?.kind === "field" &&
        !resolveFieldValue(prev.name, prev.format, metadata, moduleId) &&
        isSeparatorLiteral(part.value, mode)
      ) {
        continue;
      }
      result += part.value;
      continue;
    }

    const raw = resolveFieldValue(part.name, part.format, metadata, moduleId);
    if (!raw) continue;
    const segment = slugifySegment(raw, mode);
    if (!segment) continue;
    result += segment;
  }

  return mode === "path" ? cleanupPath(result) : cleanupTitle(result);
}

export function renderTitleTemplate(
  template: string,
  metadata: ProcessingTemplateMetadata,
  moduleId: ProcessingModuleId,
  extension?: string,
): string {
  const base = renderTemplate(template, metadata, moduleId, "title");
  if (!base) {
    return extension ? `Untitled.${extension.replace(/^\./, "")}` : "Untitled";
  }
  if (extension) {
    const ext = extension.startsWith(".") ? extension : `.${extension}`;
    return `${base}${ext}`;
  }
  return base;
}

export function renderPathTemplate(
  template: string,
  metadata: ProcessingTemplateMetadata,
  moduleId: ProcessingModuleId,
): string {
  return renderTemplate(template, metadata, moduleId, "path");
}

export function buildDestinationRelativePath(params: {
  pathTemplate: string;
  titleTemplate: string;
  metadata: ProcessingTemplateMetadata;
  moduleId: ProcessingModuleId;
  extension: string;
  renameFiles: boolean;
  originalFilename: string;
}): string {
  const dir = renderPathTemplate(
    params.pathTemplate,
    params.metadata,
    params.moduleId,
  );
  const filename = params.renameFiles
    ? renderTitleTemplate(
        params.titleTemplate,
        params.metadata,
        params.moduleId,
        params.extension,
      )
    : params.originalFilename.replace(/^.*[/\\]/, "");
  if (!dir) return filename;
  return `${dir}/${filename}`;
}

export const SAMPLE_METADATA: Record<
  ProcessingModuleId,
  ProcessingTemplateMetadata
> = {
  books: {
    title: "The Final Empire",
    authors: ["Brandon Sanderson"],
    series: "Mistborn",
    seriesNumber: "1",
    publicationDate: "2006-01-01",
  },
  comics: {
    series: "One Piece",
    seriesNumber: "42",
    title: "Volume 42",
    authors: ["Eiichiro Oda"],
  },
  movies: {
    title: "The Matrix",
    publicationDate: "1999-03-31",
  },
  tv: {
    series: "Breaking Bad",
    seasonNumber: "1",
    episodeNumber: "1",
    title: "Pilot",
  },
  audiobooks: {
    title: "The Final Empire",
    authors: ["Brandon Sanderson"],
    series: "Mistborn",
  },
  podcasts: {
    series: "Reply All",
    title: "Episode 1",
  },
  music: {
    title: "Track One",
    artist: "Artist Name",
    album: "Album Name",
    authors: ["Artist Name"],
    series: "Album Name",
  },
};

export const SAMPLE_METADATA_COMICS_CHAPTER: ProcessingTemplateMetadata = {
  series: "Solo Leveling",
  chapterNumber: "187",
};
