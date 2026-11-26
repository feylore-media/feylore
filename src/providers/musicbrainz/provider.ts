import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataFetchContext,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { outboundFetchJson } from "../../server/modules/metadata/outbound-fetch.js";
import { musicbrainzDescriptor } from "./descriptor.js";

const USER_AGENT = "Feylore/1.0";
const API_BASE = "https://musicbrainz.org/ws/2";

interface MusicBrainzArtistCredit {
  name?: string;
  artist?: { id?: string; name?: string };
}

interface MusicBrainzRelease {
  id?: string;
  title?: string;
  date?: string;
  disambiguation?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  "release-group"?: { "primary-type"?: string };
  media?: Array<{
    tracks?: Array<{
      title?: string;
      length?: number;
      number?: string;
    }>;
  }>;
}

interface MusicBrainzRecording {
  id?: string;
  title?: string;
  length?: number;
  disambiguation?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  releases?: Array<{
    id?: string;
    title?: string;
    date?: string;
  }>;
}

function artistNames(credits?: MusicBrainzArtistCredit[]): string[] {
  if (!credits?.length) return [];
  return credits
    .map((c) => c.name ?? c.artist?.name)
    .filter((n): n is string => Boolean(n));
}

async function fetchRelease(releaseId: string): Promise<MusicBrainzRelease | null> {
  try {
    return await outboundFetchJson<MusicBrainzRelease>(
      `${API_BASE}/release/${encodeURIComponent(releaseId)}?inc=artist-credits+recordings&fmt=json`,
      { headers: { "User-Agent": USER_AGENT } },
    );
  } catch {
    return null;
  }
}

async function fetchRecording(
  recordingId: string,
): Promise<MusicBrainzRecording | null> {
  try {
    return await outboundFetchJson<MusicBrainzRecording>(
      `${API_BASE}/recording/${encodeURIComponent(recordingId)}?inc=artist-credits+releases&fmt=json`,
      { headers: { "User-Agent": USER_AGENT } },
    );
  } catch {
    return null;
  }
}

function releaseToPayload(release: MusicBrainzRelease): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (release.title) payload.title = release.title;
  if (release.disambiguation) payload.description = release.disambiguation;
  if (release.date) payload.releaseDate = release.date;

  const authors = artistNames(release["artist-credit"]);
  if (authors.length) payload.authors = authors;

  const primaryType = release["release-group"]?.["primary-type"];
  if (primaryType) payload.genres = [primaryType];

  const track = release.media?.[0]?.tracks?.[0];
  if (track?.length) {
    payload.runtime = Math.round(track.length / 1000);
  }

  return payload;
}

function recordingToPayload(
  recording: MusicBrainzRecording,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (recording.title) payload.title = recording.title;
  if (recording.disambiguation) payload.description = recording.disambiguation;
  if (recording.length) payload.runtime = Math.round(recording.length / 1000);

  const authors = artistNames(recording["artist-credit"]);
  if (authors.length) payload.authors = authors;

  const release = recording.releases?.[0];
  if (release?.title) payload.album = release.title;
  if (release?.date) payload.releaseDate = release.date;

  return payload;
}

export const musicbrainzProvider: MetadataProvider = {
  key: musicbrainzDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: { ...musicbrainzDescriptor, implemented: true },
  async fetch(context: MetadataFetchContext) {
    const hints = context.hints ?? {};

    const releaseId =
      typeof hints.musicbrainzReleaseId === "string"
        ? hints.musicbrainzReleaseId
        : typeof hints.releaseId === "string"
          ? hints.releaseId
          : undefined;

    if (releaseId) {
      const release = await fetchRelease(releaseId);
      if (!release) return null;
      return {
        externalId: release.id ?? releaseId,
        payload: releaseToPayload(release),
      };
    }

    const recordingId =
      typeof hints.musicbrainzRecordingId === "string"
        ? hints.musicbrainzRecordingId
        : typeof hints.recordingId === "string"
          ? hints.recordingId
          : undefined;

    if (recordingId) {
      const recording = await fetchRecording(recordingId);
      if (!recording) return null;
      return {
        externalId: recording.id ?? recordingId,
        payload: recordingToPayload(recording),
      };
    }

    return null;
  },
};
