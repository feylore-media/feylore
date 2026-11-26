import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  DEFAULT_PRESENCE_POLICY,
  DEFAULT_PRESENCE_PREFERENCES,
  type PresenceKind,
  type PresenceMetadata,
  type PresencePolicy,
  type PresencePreferences,
  type PresenceSource,
  type PresenceStartInput,
  type PresenceView,
} from "../../../shared/presence.js";
import { generateId } from "../../security/crypto.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type { ProfileService } from "../users/profile-service.js";

const POLICY_KEY = "presence.policy";

type PresenceRow = typeof schema.presenceSessions.$inferSelect;

export interface PresenceEligibility {
  policy: PresencePolicy;
  prefs: PresencePreferences;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isPausedMetadata(metadata: unknown): boolean {
  if (typeof metadata !== "object" || metadata === null) return false;
  return (metadata as Record<string, unknown>).paused === true;
}

export class PresenceService {
  constructor(
    private readonly db: Database,
    private readonly profiles: ProfileService,
  ) {}

  // ---- Policy (admin) ----

  async getPolicy(): Promise<PresencePolicy> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, POLICY_KEY),
    });
    if (!row?.value || typeof row.value !== "object") {
      return { ...DEFAULT_PRESENCE_POLICY };
    }
    const v = row.value as Partial<PresencePolicy>;
    return {
      enabled: typeof v.enabled === "boolean" ? v.enabled : true,
      readingRecencyHours:
        typeof v.readingRecencyHours === "number" && Number.isFinite(v.readingRecencyHours)
          ? v.readingRecencyHours
          : DEFAULT_PRESENCE_POLICY.readingRecencyHours,
      playbackDisconnectMinutes:
        typeof v.playbackDisconnectMinutes === "number" &&
        Number.isFinite(v.playbackDisconnectMinutes)
          ? v.playbackDisconnectMinutes
          : DEFAULT_PRESENCE_POLICY.playbackDisconnectMinutes,
      pausedPlaybackGraceMinutes:
        typeof v.pausedPlaybackGraceMinutes === "number" &&
        Number.isFinite(v.pausedPlaybackGraceMinutes)
          ? v.pausedPlaybackGraceMinutes
          : DEFAULT_PRESENCE_POLICY.pausedPlaybackGraceMinutes,
    };
  }

  async updatePolicy(patch: Partial<PresencePolicy>): Promise<PresencePolicy> {
    const current = await this.getPolicy();
    const next: PresencePolicy = {
      enabled: patch.enabled ?? current.enabled,
      readingRecencyHours: patch.readingRecencyHours ?? current.readingRecencyHours,
      playbackDisconnectMinutes:
        patch.playbackDisconnectMinutes ?? current.playbackDisconnectMinutes,
      pausedPlaybackGraceMinutes:
        patch.pausedPlaybackGraceMinutes ?? current.pausedPlaybackGraceMinutes,
    };
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, POLICY_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: next as unknown as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, POLICY_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: POLICY_KEY,
        value: next as unknown as Record<string, unknown>,
      });
    }
    return next;
  }

  // ---- Preferences (user) ----

  private prefsFromRow(row: { settingsJson?: unknown } | undefined): PresencePreferences {
    const raw =
      typeof row?.settingsJson === "object" && row?.settingsJson !== null
        ? (row.settingsJson as Record<string, unknown>).presence
        : undefined;
    if (typeof raw !== "object" || raw === null) {
      return { ...DEFAULT_PRESENCE_PREFERENCES };
    }
    const p = raw as Partial<PresencePreferences>;
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : true,
      visibility: p.visibility === "friends" || p.visibility === "public" ? p.visibility : "private",
      readerEnabled: typeof p.readerEnabled === "boolean" ? p.readerEnabled : true,
      playerEnabled: typeof p.playerEnabled === "boolean" ? p.playerEnabled : true,
    };
  }

  async getPreferences(userId: string): Promise<PresencePreferences> {
    const row = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    return this.prefsFromRow(row ?? undefined);
  }

  async updatePreferences(
    userId: string,
    patch: Partial<PresencePreferences>,
  ): Promise<PresencePreferences> {
    const current = await this.getPreferences(userId);
    const next: PresencePreferences = {
      enabled: patch.enabled ?? current.enabled,
      visibility: patch.visibility ?? current.visibility,
      readerEnabled: patch.readerEnabled ?? current.readerEnabled,
      playerEnabled: patch.playerEnabled ?? current.playerEnabled,
    };
    const existing = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (!existing) {
      await this.db.insert(schema.userPreferences).values({
        userId,
        settingsJson: { presence: next },
      });
    } else {
      const settings =
        typeof existing.settingsJson === "object" && existing.settingsJson !== null
          ? { ...(existing.settingsJson as Record<string, unknown>) }
          : {};
      settings.presence = next;
      await this.db
        .update(schema.userPreferences)
        .set({ settingsJson: settings })
        .where(eq(schema.userPreferences.userId, userId));
    }
    return next;
  }

  // ---- Session lifecycle ----

  private async assertWorkExists(workType: string, workId: string): Promise<void> {
    const resolved = await this.resolveWorkDisplay(workType, workId);
    if (!resolved) throw new NotFoundError("Work not found");
  }

  async startPresence(userId: string, input: PresenceStartInput): Promise<PresenceRow> {
    // Canonical Work reference is mandatory for Feylore-owned sources.
    if (input.source === "feylore-reader" || input.source === "feylore-player") {
      await this.assertWorkExists(input.workType, input.workId);
    } else if (input.workType && input.workId) {
      // Integration sources: unresolved works are not published as presence.
      const resolved = await this.resolveWorkDisplay(input.workType, input.workId);
      if (!resolved) throw new NotFoundError("Work not found");
    }

    // Idempotent external sessions: same sourceInstance reuses the open row.
    if (input.sourceInstance) {
      const open = await this.db.query.presenceSessions.findFirst({
        where: eq(schema.presenceSessions.userId, userId),
      });
      if (open) {
        const candidates = await this.listUserSessions(userId, 100);
        const match = candidates.find(
          (s) =>
            !s.endedAt &&
            s.source === input.source &&
            s.sourceInstance === input.sourceInstance &&
            s.workType === input.workType &&
            s.workId === input.workId,
        );
        if (match) {
          return this.touchPresence(userId, match.id, input.metadata);
        }
      }
    }

    const id = generateId();
    const now = new Date();
    const isPlayback = input.kind === "listening" || input.kind === "watching";
    await this.db.insert(schema.presenceSessions).values({
      id,
      userId,
      kind: input.kind,
      workType: input.workType,
      workId: input.workId,
      expressionId: input.expressionId ?? null,
      manifestationId: input.manifestationId ?? null,
      representationId: input.representationId ?? null,
      source: input.source,
      sourceInstance: input.sourceInstance ?? null,
      startedAt: now,
      lastEngagedAt: now,
      lastHeartbeatAt: isPlayback ? now : null,
      endedAt: null,
      metadata: (input.metadata ?? {}) as Record<string, unknown>,
    });
    const row = await this.db.query.presenceSessions.findFirst({
      where: eq(schema.presenceSessions.id, id),
    });
    if (!row) throw new NotFoundError("Presence session not found");
    return row;
  }

  async touchPresence(
    userId: string,
    sessionId: string,
    metadata?: PresenceMetadata,
  ): Promise<PresenceRow> {
    const row = await this.ownSession(userId, sessionId);
    if (row.endedAt) throw new ForbiddenError("Presence session has ended");
    const merged = this.mergeMetadata(row.metadata, metadata);
    await this.db
      .update(schema.presenceSessions)
      .set({
        lastEngagedAt: new Date(),
        metadata: merged,
        updatedAt: new Date(),
      })
      .where(eq(schema.presenceSessions.id, sessionId));
    return (await this.db.query.presenceSessions.findFirst({
      where: eq(schema.presenceSessions.id, sessionId),
    }))!;
  }

  async heartbeatPresence(
    userId: string,
    sessionId: string,
    metadata?: PresenceMetadata,
  ): Promise<PresenceRow> {
    const row = await this.ownSession(userId, sessionId);
    if (row.endedAt) throw new ForbiddenError("Presence session has ended");
    if (row.kind === "reading") {
      throw new ForbiddenError("Reading sessions use touch, not heartbeat");
    }
    const merged = this.mergeMetadata(row.metadata, metadata);
    const now = new Date();
    await this.db
      .update(schema.presenceSessions)
      .set({
        lastEngagedAt: now,
        lastHeartbeatAt: now,
        metadata: merged,
        updatedAt: now,
      })
      .where(eq(schema.presenceSessions.id, sessionId));
    return (await this.db.query.presenceSessions.findFirst({
      where: eq(schema.presenceSessions.id, sessionId),
    }))!;
  }

  async endPresence(userId: string, sessionId: string): Promise<PresenceRow> {
    const row = await this.ownSession(userId, sessionId);
    if (row.endedAt) return row;
    const now = new Date();
    await this.db
      .update(schema.presenceSessions)
      .set({ endedAt: now, updatedAt: now })
      .where(eq(schema.presenceSessions.id, sessionId));
    return (await this.db.query.presenceSessions.findFirst({
      where: eq(schema.presenceSessions.id, sessionId),
    }))!;
  }

  private async ownSession(userId: string, sessionId: string): Promise<PresenceRow> {
    const row = await this.db.query.presenceSessions.findFirst({
      where: eq(schema.presenceSessions.id, sessionId),
    });
    if (!row || row.userId !== userId) throw new NotFoundError("Presence session not found");
    return row;
  }

  private mergeMetadata(
    stored: unknown,
    incoming: PresenceMetadata | undefined,
  ): Record<string, unknown> {
    const base =
      typeof stored === "object" && stored !== null
        ? { ...(stored as Record<string, unknown>) }
        : {};
    if (!incoming) return base;
    return { ...base, ...incoming };
  }

  async listUserSessions(userId: string, limit = 50): Promise<PresenceRow[]> {
    const { desc } = await import("drizzle-orm");
    const rows = await this.db
      .select()
      .from(schema.presenceSessions)
      .where(eq(schema.presenceSessions.userId, userId))
      .orderBy(desc(schema.presenceSessions.lastEngagedAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows;
  }

  // ---- Resolver ----

  async resolvePresenceForViewer(
    ownerId: string,
    viewerId: string | null,
  ): Promise<PresenceView | null> {
    const policy = await this.getPolicy();
    if (!policy.enabled) return null;
    const prefs = await this.getPreferences(ownerId);
    if (!prefs.enabled) return null;

    const canSee = await this.canViewerSeePresence(ownerId, viewerId, prefs.visibility);
    if (!canSee) return null;

    const sessions = await this.listUserSessions(ownerId, 50);
    const now = new Date();
    const eligible = this.filterBySource(sessions, prefs);

    const livePlayback = this.newestActivePlayback(eligible, policy, now);
    if (livePlayback) {
      const view = await this.toPresenceView(livePlayback, "live");
      if (view) return view;
    }

    const liveReading = this.newestLiveReading(eligible);
    if (liveReading) {
      const view = await this.toPresenceView(liveReading, "live");
      if (view) return view;
    }

    const recentReading = this.newestRecentReading(eligible, policy, now);
    if (recentReading) {
      const view = await this.toPresenceView(recentReading, "recent");
      if (view) return view;
    }

    return null;
  }

  /** All simultaneously live/recent sessions (privacy-filtered, unresolved works dropped). */
  async listActiveForViewer(
    ownerId: string,
    viewerId: string | null,
  ): Promise<PresenceView[]> {
    const policy = await this.getPolicy();
    if (!policy.enabled) return [];
    const prefs = await this.getPreferences(ownerId);
    if (!prefs.enabled) return [];
    const canSee = await this.canViewerSeePresence(ownerId, viewerId, prefs.visibility);
    if (!canSee) return [];

    const sessions = await this.listUserSessions(ownerId, 50);
    const now = new Date();
    const eligible = this.filterBySource(sessions, prefs);
    const out: PresenceView[] = [];

    const livePlayback = this.newestActivePlayback(eligible, policy, now);
    if (livePlayback) {
      const view = await this.toPresenceView(livePlayback, "live");
      if (view) out.push(view);
    }
    const liveReading = this.newestLiveReading(eligible);
    if (liveReading && liveReading.id !== livePlayback?.id) {
      const view = await this.toPresenceView(liveReading, "live");
      if (view) out.push(view);
    }
    if (out.length === 0) {
      const recentReading = this.newestRecentReading(eligible, policy, now);
      if (recentReading) {
        const view = await this.toPresenceView(recentReading, "recent");
        if (view) out.push(view);
      }
    }
    return out;
  }

  private filterBySource(sessions: PresenceRow[], prefs: PresencePreferences): PresenceRow[] {
    return sessions.filter((s) => {
      if (s.source === "feylore-reader" && !prefs.readerEnabled) return false;
      if (s.source === "feylore-player" && !prefs.playerEnabled) return false;
      return true;
    });
  }

  private async canViewerSeePresence(
    ownerId: string,
    viewerId: string | null,
    visibility: PresencePreferences["visibility"],
  ): Promise<boolean> {
    if (!viewerId) return false;
    if (viewerId === ownerId) return true;
    if (visibility === "private") return false;
    if (visibility === "public") return true;
    // "friends" == shared club membership (same definition as activity visibility).
    return this.profiles.usersShareClub(viewerId, ownerId);
  }

  newestActivePlayback(
    sessions: PresenceRow[],
    policy: PresencePolicy,
    now: Date,
  ): PresenceRow | null {
    const candidates = sessions.filter((s) => {
      if (s.kind !== "listening" && s.kind !== "watching") return false;
      if (s.endedAt) return false;
      const engaged = toDate(s.lastEngagedAt).getTime();
      const heartbeat = s.lastHeartbeatAt ? toDate(s.lastHeartbeatAt).getTime() : 0;
      const disconnectMs = policy.playbackDisconnectMinutes * 60_000;
      const graceMs = policy.pausedPlaybackGraceMinutes * 60_000;
      if (now.getTime() - heartbeat <= disconnectMs) return true;
      // Paused grace: no heartbeat, but an explicit paused touch within grace.
      if (isPausedMetadata(s.metadata) && now.getTime() - engaged <= graceMs) return true;
      return false;
    });
    candidates.sort(
      (a, b) => toDate(b.lastEngagedAt).getTime() - toDate(a.lastEngagedAt).getTime(),
    );
    return candidates[0] ?? null;
  }

  newestLiveReading(sessions: PresenceRow[]): PresenceRow | null {
    const candidates = sessions.filter((s) => s.kind === "reading" && !s.endedAt);
    candidates.sort(
      (a, b) => toDate(b.lastEngagedAt).getTime() - toDate(a.lastEngagedAt).getTime(),
    );
    return candidates[0] ?? null;
  }

  newestRecentReading(
    sessions: PresenceRow[],
    policy: PresencePolicy,
    now: Date,
  ): PresenceRow | null {
    const cutoff = now.getTime() - policy.readingRecencyHours * 3_600_000;
    const candidates = sessions.filter(
      (s) => s.kind === "reading" && toDate(s.lastEngagedAt).getTime() >= cutoff,
    );
    candidates.sort(
      (a, b) => toDate(b.lastEngagedAt).getTime() - toDate(a.lastEngagedAt).getTime(),
    );
    return candidates[0] ?? null;
  }

  // ---- View enrichment ----

  async toPresenceView(
    session: PresenceRow,
    liveness: "live" | "recent",
  ): Promise<PresenceView | null> {
    const display = await this.resolveWorkDisplay(session.workType, session.workId);
    if (!display) return null; // deleted/restricted works drop out of presence
    const metadata = await this.enrichMetadata(session);
    return {
      kind: session.kind as PresenceKind,
      sessionId: session.id,
      workType: session.workType,
      workId: session.workId,
      title: display.title,
      subtitle: display.subtitle ?? null,
      href: display.href ?? null,
      coverUrl: display.coverUrl ?? null,
      liveness,
      lastEngagedAt: toDate(session.lastEngagedAt).toISOString(),
      metadata,
    };
  }

  private async enrichMetadata(session: PresenceRow): Promise<PresenceMetadata> {
    const base =
      typeof session.metadata === "object" && session.metadata !== null
        ? { ...(session.metadata as Record<string, unknown>) }
        : {};
    try {
      if (session.kind === "reading" && session.representationId) {
        const progress = await this.db.query.readingProgress.findFirst({
          where: eq(schema.readingProgress.representationId, session.representationId),
        });
        if (progress && base.progressPercent === undefined) {
          const pct = readingProgressPercent(progress.locatorJson);
          if (pct !== null) base.progressPercent = pct;
        }
      } else if ((session.kind === "listening" || session.kind === "watching") && base.progressPercent === undefined) {
        const progress = await this.db.query.userProgress.findFirst({
          where: eq(schema.userProgress.userId, session.userId),
        });
        void progress;
        // Playback progress is keyed by (user, subjectType, subjectId); look it up directly.
        const { and } = await import("drizzle-orm");
        const row = await this.db.query.userProgress.findFirst({
          where: and(
            eq(schema.userProgress.userId, session.userId),
            eq(schema.userProgress.subjectType, session.workType),
            eq(schema.userProgress.subjectId, session.workId),
          ),
        });
        const locator = row?.locatorJson as
          | { positionSeconds?: number; durationSeconds?: number }
          | undefined;
        if (
          locator &&
          typeof locator.positionSeconds === "number" &&
          typeof locator.durationSeconds === "number" &&
          locator.durationSeconds > 0
        ) {
          base.progressPercent = Math.round(
            (locator.positionSeconds / locator.durationSeconds) * 100,
          );
          base.remainingSeconds = Math.max(
            0,
            Math.round(locator.durationSeconds - locator.positionSeconds),
          );
        }
      }
    } catch {
      // Enrichment is best-effort; stored metadata always wins.
    }
    return base as PresenceMetadata;
  }

  async resolveWorkDisplay(
    workType: string,
    workId: string,
  ): Promise<{ title: string; subtitle?: string; href?: string; coverUrl?: string } | null> {
    const coverUrl = (fileId: string | null | undefined) =>
      fileId ? `/api/v1/files/${fileId}/content` : undefined;
    try {
      if (workType === "book") {
        const book =
          (await this.db.query.books.findFirst({ where: eq(schema.books.id, workId) })) ??
          (await this.db.query.books.findFirst({ where: eq(schema.books.slug, workId) }));
        if (!book) return null;
        const authors = await this.db
          .select({ name: schema.bookAuthors.name })
          .from(schema.bookAuthors)
          .where(eq(schema.bookAuthors.bookId, book.id));
        return {
          title: book.title,
          subtitle: authors[0]?.name,
          href: `/books/${book.slug}`,
          coverUrl: coverUrl(book.coverFileId),
        };
      }
      if (workType === "audiobook") {
        const ab =
          (await this.db.query.audiobooks.findFirst({ where: eq(schema.audiobooks.id, workId) })) ??
          (await this.db.query.audiobooks.findFirst({ where: eq(schema.audiobooks.slug, workId) }));
        if (!ab) return null;
        const narrators = await this.db
          .select({ name: schema.audiobookNarrators.name })
          .from(schema.audiobookNarrators)
          .where(eq(schema.audiobookNarrators.audiobookId, ab.id));
        return {
          title: ab.title,
          subtitle: narrators[0]?.name,
          href: `/audiobooks/${ab.slug}`,
          coverUrl: coverUrl(ab.coverFileId),
        };
      }
      if (workType === "movie") {
        const movie =
          (await this.db.query.movies.findFirst({ where: eq(schema.movies.id, workId) })) ??
          (await this.db.query.movies.findFirst({ where: eq(schema.movies.slug, workId) }));
        if (!movie) return null;
        return {
          title: movie.title,
          subtitle: movie.releaseDate ?? undefined,
          href: `/movies/${movie.slug}`,
          coverUrl: coverUrl(movie.coverFileId),
        };
      }
      if (workType === "album") {
        const album =
          (await this.db.query.albums.findFirst({ where: eq(schema.albums.id, workId) })) ??
          (await this.db.query.albums.findFirst({ where: eq(schema.albums.slug, workId) }));
        if (!album) return null;
        return {
          title: album.title,
          href: `/music/albums/${album.slug}`,
          coverUrl: coverUrl(album.coverFileId),
        };
      }
      if (workType === "track") {
        const track = await this.db.query.musicTracks.findFirst({
          where: eq(schema.musicTracks.id, workId),
        });
        if (!track) return null;
        const album = await this.db.query.albums.findFirst({
          where: eq(schema.albums.id, track.albumId),
        });
        return {
          title: track.title,
          subtitle: album?.title,
          href: album ? `/music/albums/${album.slug}` : undefined,
          coverUrl: coverUrl(album?.coverFileId),
        };
      }
      if (workType === "show") {
        const show =
          (await this.db.query.tvShows.findFirst({ where: eq(schema.tvShows.id, workId) })) ??
          (await this.db.query.tvShows.findFirst({ where: eq(schema.tvShows.slug, workId) }));
        if (!show) return null;
        return {
          title: show.title,
          href: `/tv/shows/${show.slug}`,
          coverUrl: coverUrl(show.coverFileId),
        };
      }
      if (workType === "tv_episode") {
        const episode = await this.db.query.tvEpisodes.findFirst({
          where: eq(schema.tvEpisodes.id, workId),
        });
        if (!episode) return null;
        const show = await this.db.query.tvShows.findFirst({
          where: eq(schema.tvShows.id, episode.showId),
        });
        return {
          title: episode.title,
          subtitle: show?.title,
          href: show ? `/tv/shows/${show.slug}` : undefined,
          coverUrl: coverUrl(episode.coverFileId ?? show?.coverFileId),
        };
      }
      if (workType === "podcast_episode") {
        const episode = await this.db.query.podcastEpisodes.findFirst({
          where: eq(schema.podcastEpisodes.id, workId),
        });
        if (!episode) return null;
        const show = await this.db.query.podcastShows.findFirst({
          where: eq(schema.podcastShows.id, episode.showId),
        });
        return {
          title: episode.title,
          subtitle: show?.title,
          href: show ? `/audiobooks/podcasts/${show.slug}` : undefined,
          coverUrl: coverUrl(show?.coverFileId),
        };
      }
    } catch {
      return null;
    }
    return null;
  }
}

function readingProgressPercent(locator: unknown): number | null {
  if (typeof locator !== "object" || locator === null) return null;
  const record = locator as Record<string, unknown>;
  const raw = record.totalProgression ?? record.progression;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return Math.round(raw * 100);
}

export type { PresenceSource };
