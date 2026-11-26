import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";

export const PODCAST_PREPARE_STATUSES = [
  "none",
  "pending",
  "ready",
  "failed",
] as const;

export type PodcastPrepareStatus = (typeof PODCAST_PREPARE_STATUSES)[number];

export const subscribePodcastSchema = z.object({
  feedUrl: z.string().url(),
});

export const podcastListQuerySchema = z.object({
  q: z.string().optional(),
  view: z.enum(["subscribed", "new", "continue"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type PodcastListQuery = z.infer<typeof podcastListQuerySchema>;

export const podcastEpisodeListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type PodcastEpisodeListQuery = z.infer<
  typeof podcastEpisodeListQuerySchema
>;

export interface PodcastShowListItem {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  description?: string;
  author?: string;
  coverFileId?: string;
  subscribed: boolean;
  episodeCount?: number;
  latestEpisodeAt?: string;
}

export interface PodcastShowDetail extends PodcastShowListItem {
  feedUrl?: string;
  recentEpisodes: PodcastEpisodeListItem[];
}

export interface PodcastEpisodeListItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  publishedAt?: string;
  durationSeconds?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  prepareStatus: PodcastPrepareStatus;
  representationId?: string;
  unavailable?: boolean;
}

export interface PodcastEpisodeDetail extends PodcastEpisodeListItem {
  showId: string;
  showSlug: string;
  showTitle: string;
  guid: string;
  prepareError?: string;
}

export interface PodcastPrepareResult {
  prepareStatus: PodcastPrepareStatus;
  representationId?: string;
  prepareError?: string;
}

export interface PodcastContinueListeningItem extends PodcastEpisodeListItem {
  showSlug: string;
  showTitle: string;
  positionSeconds?: number;
}
