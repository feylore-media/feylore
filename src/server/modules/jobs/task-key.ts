import { createHash } from "node:crypto";
import { JOB_TYPES, type JobType } from "./types.js";

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function hashFileIds(fileIds: unknown): string {
  if (!Array.isArray(fileIds)) return "";
  const ids = fileIds
    .filter((id): id is string => typeof id === "string")
    .sort();
  if (ids.length === 0) return "";
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

export function deriveTaskKey(
  type: JobType | string,
  payload: Record<string, unknown>,
  jobId: string,
): string {
  switch (type) {
    case JOB_TYPES.LIBRARY_SCAN:
      return stringField(payload, "storageLocationId") ?? jobId;

    case JOB_TYPES.LIBRARY_ASSOCIATE: {
      const storageLocationId = stringField(payload, "storageLocationId");
      if (storageLocationId) return storageLocationId;
      const fileHash = hashFileIds(payload.fileIds);
      return fileHash || jobId;
    }

    case JOB_TYPES.PERSON_METADATA_FETCH:
      return stringField(payload, "personId") ?? jobId;

    case JOB_TYPES.METADATA_INGEST:
      return (
        stringField(payload, "representationId") ??
        stringField(payload, "fileId") ??
        jobId
      );

    case JOB_TYPES.ARTWORK_FETCH:
      return stringField(payload, "representationId") ?? jobId;

    case JOB_TYPES.DOWNLOAD_PREPARE:
      return stringField(payload, "downloadId") ?? jobId;

    case JOB_TYPES.MEDIA_PROCESS:
      return (
        stringField(payload, "representationId") ??
        stringField(payload, "fileId") ??
        jobId
      );

    case JOB_TYPES.PODCAST_FEED_SYNC:
      return stringField(payload, "feedId") ?? jobId;

    case JOB_TYPES.PODCAST_ENCLOSURE_FETCH:
      return stringField(payload, "episodeId") ?? jobId;

    case JOB_TYPES.SEARCH_INDEX: {
      const entityType = stringField(payload, "entityType");
      const entityId = stringField(payload, "entityId");
      if (entityType && entityId) return `${entityType}:${entityId}`;
      return jobId;
    }

    default:
      return jobId;
  }
}
