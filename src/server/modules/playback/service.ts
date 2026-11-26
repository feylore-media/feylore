import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type { SubjectRef } from "../../../shared/subject.js";
import type {
  PlaybackLocator,
  PlaybackManifest,
  PlaybackMediaKind,
} from "../../../shared/playback.js";
import {
  isPlaybackComplete,
  PLAYBACK_HISTORY_EVENT_TYPES,
} from "../../../shared/playback.js";
import {
  isPlaybackProgressLocator,
} from "../../../shared/progress-locator.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { FileService } from "../files/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { ActivityService } from "../activity/service.js";
import { ACTIVITY_TYPES } from "../../../shared/activity.js";
import { titleFromPath } from "../../../shared/subject.js";
import type { StatsFactRecorder } from "../stats/facts.js";
import { randomUUID } from "node:crypto";

export interface ResolvedWork {
  workType: string;
  workId: string;
  title: string;
  subtitle?: string;
}

const VIDEO_FORMATS = new Set(["video", "mp4", "mkv", "webm"]);

function mediaKindForFormat(format: string): PlaybackMediaKind {
  if (VIDEO_FORMATS.has(format)) return "video";
  return "audio";
}

export class PlaybackService {
  constructor(
    private readonly db: Database,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly representations: RepresentationService,
    private readonly files: FileService,
    private readonly userState: UserStateService,
    private readonly activity: ActivityService,
    private readonly statsRecorder?: StatsFactRecorder,
  ) {}

  async resolveWorkFromRepresentation(
    representationId: string,
  ): Promise<ResolvedWork | null> {
    const rep = await this.representations.get(representationId);
    if (!rep.manifestationId) return null;

    const manifestation = await this.db.query.creativeWorkManifestations.findFirst({
      where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
    });
    if (!manifestation) return null;

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
    });
    if (!expression) return null;

    const titleInfo = await this.resolveWorkTitle(
      expression.workType,
      expression.workId,
      manifestation.label ?? rep.format,
    );

    return {
      workType: expression.workType,
      workId: expression.workId,
      ...titleInfo,
    };
  }

  private async resolveWorkTitle(
    workType: string,
    workId: string,
    fallback: string,
  ): Promise<{ title: string; subtitle?: string }> {
    if (workType === "book") {
      const book = await this.db.query.books.findFirst({
        where: eq(schema.books.id, workId),
      });
      if (book) {
        return {
          title: book.title,
          subtitle: book.subtitle ?? undefined,
        };
      }
    }
    if (workType === "audiobook") {
      const audiobook = await this.db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, workId),
      });
      if (audiobook) {
        return {
          title: audiobook.title,
          subtitle: audiobook.subtitle ?? undefined,
        };
      }
    }
    if (workType === "podcast_episode") {
      const episode = await this.db.query.podcastEpisodes.findFirst({
        where: eq(schema.podcastEpisodes.id, workId),
      });
      if (episode) {
        const show = await this.db.query.podcastShows.findFirst({
          where: eq(schema.podcastShows.id, episode.showId),
        });
        return {
          title: episode.title,
          subtitle: show?.title,
        };
      }
    }
    if (workType === "album") {
      const album = await this.db.query.albums.findFirst({
        where: eq(schema.albums.id, workId),
      });
      if (album) {
        return {
          title: album.title,
          subtitle: album.subtitle ?? undefined,
        };
      }
    }
    if (workType === "movie") {
      const movie = await this.db.query.movies.findFirst({
        where: eq(schema.movies.id, workId),
      });
      if (movie) {
        return {
          title: movie.title,
          subtitle: movie.subtitle ?? undefined,
        };
      }
    }
    if (workType === "tv_episode") {
      const episode = await this.db.query.tvEpisodes.findFirst({
        where: eq(schema.tvEpisodes.id, workId),
      });
      if (episode) {
        const show = await this.db.query.tvShows.findFirst({
          where: eq(schema.tvShows.id, episode.showId),
        });
        const season = await this.db.query.tvSeasons.findFirst({
          where: eq(schema.tvSeasons.id, episode.seasonId),
        });
        const seasonNumber = season?.seasonNumber ?? 0;
        const episodeCode = `S${String(seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
        return {
          title: episode.title,
          subtitle: show ? `${show.title} · ${episodeCode}` : episodeCode,
        };
      }
    }
    if (workType === "track") {
      const track = await this.db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.id, workId),
      });
      if (track) {
        const album = await this.db.query.albums.findFirst({
          where: eq(schema.albums.id, track.albumId),
        });
        return {
          title: track.title,
          subtitle: album?.title,
        };
      }
    }
    return { title: fallback || "Untitled" };
  }

  async ensureRepresentationAccess(
    userId: string,
    representationId: string,
  ): Promise<ResolvedWork> {
    const work = await this.resolveWorkFromRepresentation(representationId);
    if (!work) {
      throw new ForbiddenError("Representation not accessible");
    }

    if (work.workType === "podcast_episode") {
      const episode = await this.db.query.podcastEpisodes.findFirst({
        where: eq(schema.podcastEpisodes.id, work.workId),
      });
      if (!episode || episode.unavailableAt) {
        throw new NotFoundError("Episode not available");
      }
    } else if (work.workType === "tv_episode") {
      const episode = await this.db.query.tvEpisodes.findFirst({
        where: eq(schema.tvEpisodes.id, work.workId),
      });
      if (!episode) {
        throw new ForbiddenError("Work not in your library");
      }
      const memberships = await this.libraryMembership.listForUser(
        userId,
        "show",
      );
      if (!memberships.some((m) => m.targetId === episode.showId)) {
        throw new ForbiddenError("Work not in your library");
      }
    } else {
      const memberships = await this.libraryMembership.listForUser(
        userId,
        work.workType,
      );
      if (!memberships.some((m) => m.targetId === work.workId)) {
        throw new ForbiddenError("Work not in your library");
      }
    }

    const rep = await this.representations.get(representationId);
    if (rep.unavailableAt) {
      throw new NotFoundError("Representation unavailable");
    }

    return work;
  }

  async getPlaybackManifest(
    userId: string,
    representationId: string,
  ): Promise<PlaybackManifest> {
    const work = await this.ensureRepresentationAccess(userId, representationId);
    const rep = await this.representations.get(representationId);
    const fileLinks =
      await this.representations.listFilesForRepresentation(representationId);

    if (fileLinks.length === 0) {
      throw new NotFoundError("No playable files for representation");
    }

    const sources = await Promise.all(
      fileLinks.map(async (link) => {
        const file = await this.files.getFile(link.fileId);
        const technical = await this.db.query.fileTechnicalMetadata.findFirst({
          where: eq(schema.fileTechnicalMetadata.fileId, link.fileId),
        });
        const durationSeconds =
          typeof technical?.payload?.durationSeconds === "number"
            ? technical.payload.durationSeconds
            : undefined;

        return {
          fileId: file.id,
          url: `/api/v1/files/${file.id}/content`,
          mimeType: file.mediaType ?? undefined,
          durationSeconds,
        };
      }),
    );

    const subject: SubjectRef = {
      type: work.workType as SubjectRef["type"],
      id: work.workId,
    };

    return {
      subject,
      representationId,
      title: work.title,
      subtitle: work.subtitle,
      mediaKind: mediaKindForFormat(rep.format),
      sources,
      sessionMode: "ephemeral",
    };
  }

  async getPlaybackProgress(
    userId: string,
    subjectType: string,
    subjectId: string,
  ) {
    const progress = await this.userState.getProgress(
      userId,
      subjectType,
      subjectId,
    );
    if (!progress || !isPlaybackProgressLocator(progress.locator)) {
      return null;
    }
    return {
      locator: progress.locator,
      representationId: progress.representationId,
      updatedAt: progress.updatedAt,
    };
  }

  async setPlaybackProgress(
    userId: string,
    subjectType: string,
    subjectId: string,
    locator: PlaybackLocator,
    representationId?: string,
  ) {
    const completed =
      locator.completed ??
      (locator.durationSeconds
        ? isPlaybackComplete(locator.positionSeconds, locator.durationSeconds)
        : false);

    const storedLocator: PlaybackLocator = {
      ...locator,
      completed,
    };

    const previous = await this.getPlaybackProgress(
      userId,
      subjectType,
      subjectId,
    );

    await this.userState.setProgress(
      userId,
      subjectType,
      subjectId,
      storedLocator,
      representationId,
    );

    await this.userState.addHistory(
      userId,
      subjectType,
      subjectId,
      PLAYBACK_HISTORY_EVENT_TYPES.LISTENING_PROGRESS_UPDATED,
      { locator: storedLocator, representationId },
    );

    const activityPayload = { subjectType, subjectId, representationId };
    if (!previous) {
      await this.activity.record(userId, ACTIVITY_TYPES.LISTENING_STARTED, {
        subjectType,
        subjectId,
        payload: activityPayload,
      });
      await this.statsRecorder?.record({
        userId,
        kind: "play",
        subjectType,
        subjectId,
        occurredAt: new Date(),
        value: 1,
        unit: "plays",
        source: "playback",
        sourceKey: randomUUID(),
      });
    }

    const wasCompleted = previous?.locator.completed === true;
    if (completed) {
      await this.activity.record(userId, ACTIVITY_TYPES.LISTENING_FINISHED, {
        subjectType,
        subjectId,
        payload: activityPayload,
      });
      if (!wasCompleted) {
        await this.statsRecorder?.record({
          userId,
          kind: "completed",
          subjectType,
          subjectId,
          occurredAt: new Date(),
          value: 1,
          unit: "count",
          source: "playback",
          sourceKey: randomUUID(),
        });
      }
    } else {
      await this.activity.record(
        userId,
        ACTIVITY_TYPES.LISTENING_PROGRESS_UPDATED,
        {
          subjectType,
          subjectId,
          payload: { ...activityPayload, locator: storedLocator },
        },
      );
    }

    return { locator: storedLocator };
  }

  async recordPlaybackEvent(
    userId: string,
    subjectType: string,
    subjectId: string,
    eventType: string,
    payload?: Record<string, unknown>,
  ) {
    await this.userState.addHistory(
      userId,
      subjectType,
      subjectId,
      eventType,
      payload,
    );
  }

  async listPlaybackHistory(userId: string, limit = 50) {
    const rows = await this.userState.listRecentHistoryByEventTypes(
      userId,
      Object.values(PLAYBACK_HISTORY_EVENT_TYPES),
      limit,
    );
    return rows.map((r) => ({
      id: r.id,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      eventType: r.eventType,
      payload: r.payload,
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  /** Resolve a display title from the first linked file when WEM chain is absent. */
  async provisionalTitleFromRepresentation(representationId: string) {
    const links =
      await this.representations.listFilesForRepresentation(representationId);
    if (links.length === 0) return "Untitled";
    const file = await this.files.getFile(links[0]!.fileId);
    return titleFromPath(file.relativePath);
  }
}
