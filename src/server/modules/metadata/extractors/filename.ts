import { titleFromPath } from "../../../../shared/subject.js";

export const EXTRACTOR_FILENAME = "embedded.filename" as const;

export interface FilenameMetadata {
  title: string;
}

export function extractFilenameMetadata(
  relativePath: string,
): FilenameMetadata {
  return { title: titleFromPath(relativePath) };
}
