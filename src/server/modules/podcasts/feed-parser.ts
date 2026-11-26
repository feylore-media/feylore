import Parser from "rss-parser";
import { plainTextFromHtml } from "../../../shared/plain-text.js";

const parser = new Parser({
  customFields: {
    item: [
      ["itunes:duration", "itunesDuration"],
      ["itunes:episode", "itunesEpisode"],
      ["itunes:season", "itunesSeason"],
    ],
  },
});

export interface ParsedPodcastFeed {
  title: string;
  description?: string;
  author?: string;
  imageUrl?: string;
  link?: string;
  episodes: ParsedPodcastEpisode[];
}

export interface ParsedPodcastEpisode {
  guid: string;
  title: string;
  description?: string;
  publishedAt?: Date;
  durationSeconds?: number;
  episodeNumber?: number;
  seasonNumber?: number;
  enclosureUrl?: string;
  enclosureMime?: string;
  enclosureBytes?: number;
  imageUrl?: string;
}

function parseDuration(value: unknown): number | undefined {
  if (typeof value === "number" && value > 0) return Math.round(value);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  const parts = trimmed.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return undefined;
}

function episodeGuid(item: Parser.Item, index: number): string {
  if (item.guid && String(item.guid).trim()) return String(item.guid).trim();
  if (item.link && item.link.trim()) return item.link.trim();
  if (item.enclosure?.url) return item.enclosure.url;
  return `synthetic-${index}-${item.title ?? "untitled"}`;
}

export async function parsePodcastFeed(xml: string): Promise<ParsedPodcastFeed> {
  const feed = await parser.parseString(xml);
  const imageUrl =
    typeof feed.itunes?.image === "string"
      ? feed.itunes.image
      : (feed.itunes?.image as { href?: string } | undefined)?.href ??
        feed.image?.url;

  const episodes: ParsedPodcastEpisode[] = (feed.items ?? []).map(
    (item, index) => {
      const raw = item as Parser.Item & {
        itunesDuration?: string;
        itunesEpisode?: string;
        itunesSeason?: string;
        itunes?: {
          image?: string | { href?: string };
          duration?: string;
        };
      };
      const enclosure = raw.enclosure;
      const itemImage =
        typeof raw.itunes?.image === "string"
          ? raw.itunes.image
          : raw.itunes?.image?.href;

      return {
        guid: episodeGuid(raw, index),
        title: raw.title?.trim() || `Episode ${index + 1}`,
        description: plainTextFromHtml(
          raw.contentSnippet ?? raw.content ?? raw.summary,
        ),
        publishedAt: raw.pubDate ? new Date(raw.pubDate) : undefined,
        durationSeconds: parseDuration(
          raw.itunesDuration ?? raw.itunes?.duration,
        ),
        episodeNumber: raw.itunesEpisode
          ? Number.parseInt(String(raw.itunesEpisode), 10)
          : undefined,
        seasonNumber: raw.itunesSeason
          ? Number.parseInt(String(raw.itunesSeason), 10)
          : undefined,
        enclosureUrl: enclosure?.url,
        enclosureMime: enclosure?.type,
        enclosureBytes: enclosure?.length
          ? Number.parseInt(String(enclosure.length), 10)
          : undefined,
        imageUrl: itemImage,
      };
    },
  );

  return {
    title: feed.title?.trim() || "Untitled Podcast",
    description: plainTextFromHtml(feed.description ?? feed.itunes?.summary),
    author: feed.itunes?.author ?? feed.creator ?? feed.managingEditor,
    imageUrl,
    link: feed.link,
    episodes,
  };
}
