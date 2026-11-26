export const JOB_TYPES = {
  LIBRARY_SCAN: "library.scan",
  LIBRARY_ASSOCIATE: "library.associate",
  METADATA_INGEST: "metadata.ingest",
  PERSON_METADATA_FETCH: "metadata.person.fetch",
  METADATA_PERSISTENCE_SYNC: "metadata.persistence.sync",
  INGEST_PROCESS: "ingest.process",
  ARTWORK_FETCH: "artwork.fetch",
  SEARCH_INDEX: "search.index",
  DOWNLOAD_PREPARE: "download.prepare",
  MEDIA_PROCESS: "media.process",
  PODCAST_FEED_SYNC: "podcast.feed.sync",
  PODCAST_ENCLOSURE_FETCH: "podcast.enclosure.fetch",
  CLUB_SCHEDULE_TICK: "club.schedule.tick",
  NOTIFICATION_EMAIL: "notification.email",
  STATS_BACKFILL: "stats.backfill",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
