import { inArray, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { JOB_TYPES } from "./types.js";

export interface TaskLabelInput {
  type: string;
  taskKey: string;
}

function truncateTaskKey(taskKey: string, max = 32): string {
  if (taskKey.length <= max) return taskKey;
  return `${taskKey.slice(0, max)}…`;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export async function resolveTaskLabels(
  db: Database,
  tasks: TaskLabelInput[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const keyFor = (type: string, taskKey: string) => `${type}\0${taskKey}`;

  for (const task of tasks) {
    labels.set(keyFor(task.type, task.taskKey), truncateTaskKey(task.taskKey));
  }

  const storageLocationIds = new Set<string>();
  const feedIds = new Set<string>();
  const episodeIds = new Set<string>();
  const downloadIds = new Set<string>();
  const fileIds = new Set<string>();
  const representationIds = new Set<string>();
  const personIds = new Set<string>();

  for (const task of tasks) {
    switch (task.type) {
      case JOB_TYPES.LIBRARY_SCAN:
      case JOB_TYPES.LIBRARY_ASSOCIATE:
        storageLocationIds.add(task.taskKey);
        break;
      case JOB_TYPES.PODCAST_FEED_SYNC:
        feedIds.add(task.taskKey);
        break;
      case JOB_TYPES.PODCAST_ENCLOSURE_FETCH:
        episodeIds.add(task.taskKey);
        break;
      case JOB_TYPES.DOWNLOAD_PREPARE:
        downloadIds.add(task.taskKey);
        break;
      case JOB_TYPES.METADATA_INGEST:
      case JOB_TYPES.MEDIA_PROCESS:
        if (task.taskKey.length === 36 && task.taskKey.includes("-")) {
          representationIds.add(task.taskKey);
          fileIds.add(task.taskKey);
        } else {
          fileIds.add(task.taskKey);
        }
        break;
      case JOB_TYPES.ARTWORK_FETCH:
        representationIds.add(task.taskKey);
        break;
      case JOB_TYPES.PERSON_METADATA_FETCH:
        personIds.add(task.taskKey);
        break;
      default:
        break;
    }
  }

  if (storageLocationIds.size > 0) {
    const rows = await db
      .select({ id: schema.storageLocations.id, name: schema.storageLocations.name })
      .from(schema.storageLocations)
      .where(inArray(schema.storageLocations.id, [...storageLocationIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          (task.type === JOB_TYPES.LIBRARY_SCAN ||
            task.type === JOB_TYPES.LIBRARY_ASSOCIATE) &&
          task.taskKey === row.id
        ) {
          labels.set(keyFor(task.type, task.taskKey), row.name);
        }
      }
    }
  }

  if (feedIds.size > 0) {
    const rows = await db
      .select({
        feedId: schema.podcastFeeds.id,
        title: schema.podcastShows.title,
      })
      .from(schema.podcastFeeds)
      .innerJoin(
        schema.podcastShows,
        eq(schema.podcastFeeds.showId, schema.podcastShows.id),
      )
      .where(inArray(schema.podcastFeeds.id, [...feedIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          task.type === JOB_TYPES.PODCAST_FEED_SYNC &&
          task.taskKey === row.feedId
        ) {
          labels.set(keyFor(task.type, task.taskKey), row.title);
        }
      }
    }
  }

  if (episodeIds.size > 0) {
    const rows = await db
      .select({
        id: schema.podcastEpisodes.id,
        title: schema.podcastEpisodes.title,
      })
      .from(schema.podcastEpisodes)
      .where(inArray(schema.podcastEpisodes.id, [...episodeIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          task.type === JOB_TYPES.PODCAST_ENCLOSURE_FETCH &&
          task.taskKey === row.id
        ) {
          labels.set(keyFor(task.type, task.taskKey), row.title);
        }
      }
    }
  }

  if (downloadIds.size > 0) {
    const rows = await db
      .select({
        downloadId: schema.downloads.id,
        relativePath: schema.files.relativePath,
      })
      .from(schema.downloads)
      .innerJoin(schema.files, eq(schema.downloads.fileId, schema.files.id))
      .where(inArray(schema.downloads.id, [...downloadIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          task.type === JOB_TYPES.DOWNLOAD_PREPARE &&
          task.taskKey === row.downloadId
        ) {
          labels.set(keyFor(task.type, task.taskKey), basename(row.relativePath));
        }
      }
    }
  }

  if (fileIds.size > 0) {
    const rows = await db
      .select({
        id: schema.files.id,
        relativePath: schema.files.relativePath,
      })
      .from(schema.files)
      .where(inArray(schema.files.id, [...fileIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          (task.type === JOB_TYPES.METADATA_INGEST ||
            task.type === JOB_TYPES.MEDIA_PROCESS) &&
          task.taskKey === row.id
        ) {
          labels.set(keyFor(task.type, task.taskKey), basename(row.relativePath));
        }
      }
    }
  }

  if (representationIds.size > 0) {
    const rows = await db
      .select({
        id: schema.representations.id,
        format: schema.representations.format,
        domainModule: schema.representations.domainModule,
        relativePath: schema.files.relativePath,
      })
      .from(schema.representations)
      .leftJoin(
        schema.representationFiles,
        eq(schema.representations.id, schema.representationFiles.representationId),
      )
      .leftJoin(
        schema.files,
        eq(schema.representationFiles.fileId, schema.files.id),
      )
      .where(inArray(schema.representations.id, [...representationIds]));
    for (const row of rows) {
      const label =
        row.relativePath != null
          ? basename(row.relativePath)
          : `${row.domainModule} ${row.format}`;
      for (const task of tasks) {
        if (
          (task.type === JOB_TYPES.METADATA_INGEST ||
            task.type === JOB_TYPES.MEDIA_PROCESS ||
            task.type === JOB_TYPES.ARTWORK_FETCH) &&
          task.taskKey === row.id
        ) {
          labels.set(keyFor(task.type, task.taskKey), label);
        }
      }
    }
  }

  if (personIds.size > 0) {
    const rows = await db
      .select({ id: schema.people.id, name: schema.people.name })
      .from(schema.people)
      .where(inArray(schema.people.id, [...personIds]));
    for (const row of rows) {
      for (const task of tasks) {
        if (
          task.type === JOB_TYPES.PERSON_METADATA_FETCH &&
          task.taskKey === row.id
        ) {
          labels.set(keyFor(task.type, task.taskKey), row.name);
        }
      }
    }
  }

  return labels;
}

export function taskMapKey(type: string, taskKey: string): string {
  return `${type}\0${taskKey}`;
}
