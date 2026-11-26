import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import { ClubUpcomingService } from "../clubs/upcoming.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import {
  CALENDAR_DOMAINS,
  CALENDAR_DEFAULT_DOMAINS,
  CALENDAR_DEFAULT_SOURCES,
  CALENDAR_PREFERENCES_KEY,
  CALENDAR_SOURCES,
  parseReleaseDate,
  type CalendarFilters,
  type CalendarPreferences,
  type CalendarSourceId,
  type ParsedReleaseDate,
} from "../../../shared/calendar.js";
import type { ClubEvent } from "../../../shared/club-experience.js";
import {
  eventSortKey,
  type CalendarDomain,
  type CalendarPerson,
  type CalendarSeriesRef,
  type DatePrecision,
  type EventStatus,
  type UpcomingEvent,
} from "../../../shared/upcoming.js";

const dayStr = (date: Date) => date.toISOString().slice(0, 10);

/** Prefer the most authoritative provider payload, like people/service. */
function providerPriority(subjectType: string, providerKey: string): number {
  const order =
    subjectType === "audiobook"
      ? ["audible", "embedded.audio.tags"]
      : ["hardcover", "open-library", "embedded.epub.opf"];
  const priority = order.indexOf(providerKey);
  return priority < 0 ? -1 : priority;
}

/** Include a release when its known precision overlaps the [from, to] range. */
function releaseInWindow(
  release: ParsedReleaseDate,
  from: string,
  to: string,
): boolean {
  if (release.precision === "day" && release.day) {
    return release.day >= from && release.day <= to;
  }
  if (release.precision === "month" || release.precision === "season") {
    const bucket = release.bucket ?? "";
    return bucket >= from.slice(0, 7) && bucket <= to.slice(0, 7);
  }
  if (release.precision === "year" && release.bucket) {
    return release.bucket >= from.slice(0, 4) && release.bucket <= to.slice(0, 4);
  }
  return false;
}

interface ReleaseEventInput {
  domain: CalendarDomain;
  kind: string;
  release: ParsedReleaseDate;
  label: string;
  title: string | null;
  href: string;
  description: string | null;
  artworkFileId: string | null;
  workId: string;
  expressionId: string | null;
  discoveredAt: string;
  updatedAt: string;
  people?: CalendarPerson[];
  series?: CalendarSeriesRef[];
  reasons: string[];
  source: string;
}

function releaseEvent(input: ReleaseEventInput): UpcomingEvent {
  const {
    domain,
    kind,
    release,
    label,
    title,
    href,
    description,
    artworkFileId,
    workId,
    expressionId,
    discoveredAt,
    updatedAt,
    people = [],
    series = [],
    reasons,
    source,
  } = input;
  const day = release.precision === "day" ? release.day : null;
  const precision: DatePrecision =
    release.precision === "day" ? "day" : release.precision;
  const status: EventStatus =
    release.precision === "day" ? ("confirmed" as const) : ("tentative" as const);
  const seed = [source, kind, workId, release.bucket ?? release.day ?? "u"]
    .join(":")
    .replace(/\s+/g, "-");
  return {
    id: seed,
    domain,
    kind,
    startsAt: null,
    endsAt: null,
    datePrecision: precision,
    releaseDate: day,
    releaseEndDate: null,
    releaseBucket: release.bucket ?? day,
    releaseWindowLabel: release.label,
    timezone: null,
    label,
    title,
    href,
    description,
    artworkFileId,
    workId,
    expressionId,
    manifestationId: null,
    people,
    series,
    reasons,
    userIntent: null,
    status,
    source,
    discoveredAt,
    updatedAt,
  };
}

function clubEventToUpcoming(event: ClubEvent): UpcomingEvent {
  const dayBound =
    event.kind === "club_read_start" || event.kind === "club_read_end";
  return {
    id: event.id,
    domain: "club",
    kind: event.kind,
    startsAt: event.startsAt,
    endsAt: null,
    datePrecision: dayBound ? "day" : "timestamp",
    releaseDate: dayBound ? event.startsAt.slice(0, 10) : null,
    releaseEndDate: null,
    releaseBucket: event.startsAt.slice(0, 10),
    releaseWindowLabel: null,
    timezone: null,
    label: event.label,
    title: null,
    href: event.href,
    description: null,
    artworkFileId: null,
    workId: event.clubReadId ?? null,
    expressionId: null,
    manifestationId: null,
    people: [],
    series: [],
    reasons: ["club"],
    userIntent: null,
    status: "confirmed",
    source: "club",
    discoveredAt: event.startsAt,
    updatedAt: event.startsAt,
  };
}

/**
 * Composes every authorized calendar event source for the current user:
 * club schedule projections and media release dates derived from the user's
 * own library memberships and podcast subscriptions. The media release
 * providers never invent precision for a partial date.
 */
export class CalendarService {
  constructor(
    private readonly db: Database,
    private readonly clubUpcoming: ClubUpcomingService,
  ) {}

  async list(
    user: AuthUser,
    filters: CalendarFilters,
  ): Promise<UpcomingEvent[]> {
    const { domains, sources, from, to, limit } = filters;
    const events: UpcomingEvent[] = [];
    const takeLibrary =
      (sources === null || sources.includes("library")) &&
      (domains === null || domains.length > 0);
    const takeClub =
      (sources === null || sources.includes("club")) &&
      (domains === null || domains.includes("club"));

    if (takeClub) {
      const clubEvents = await this.clubUpcoming.globalRange(
        user,
        new Date(`${from}T00:00:00.000Z`),
        new Date(`${to}T23:59:59.999Z`),
      );
      events.push(...clubEvents.map(clubEventToUpcoming));
    }

    if (takeLibrary) {
      const media: CalendarDomain[] = domains ?? [
        "book",
        "audiobook",
        "music",
        "movie",
        "tv",
        "podcast",
      ];
      const jobs: Promise<UpcomingEvent[]>[] = [];
      if (media.includes("book") || media.includes("audiobook")) {
        jobs.push(this.booksAndAudiobooks(user, from, to, media));
      }
      if (media.includes("music")) jobs.push(this.albums(user, from, to));
      if (media.includes("movie")) jobs.push(this.movies(user, from, to));
      if (media.includes("tv")) jobs.push(this.tv(user, from, to));
      if (media.includes("podcast")) jobs.push(this.podcasts(user, from, to));
      const results = await Promise.all(jobs);
      for (const group of results) events.push(...group);
    }

    events.sort(
      (a, b) =>
        eventSortKey(a).localeCompare(eventSortKey(b)) || a.id.localeCompare(b.id),
    );
    if (limit && events.length > limit) return events.slice(0, limit);
    return events;
  }

  /** Home "/upcoming" keeps the historical club-only projection. */
  async home(
    user: AuthUser,
    now = new Date(),
    limit = 30,
  ): Promise<UpcomingEvent[]> {
    if (!user.permissions.has(PERMISSIONS.CLUBS_READ)) return [];
    const clubEvents = await this.clubUpcoming.global(user, now, limit);
    return clubEvents
      .map(clubEventToUpcoming)
      .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
  }

  // --- Per-user calendar preferences -------------------------------------------

  async getPreferences(userId: string): Promise<CalendarPreferences> {
    const row = await this.db.query.userPreferences.findFirst({
      where: and(eq(schema.userPreferences.userId, userId)),
    });
    const stored = row?.settingsJson?.[CALENDAR_PREFERENCES_KEY] as
      | Partial<CalendarPreferences>
      | undefined;
    return {
      view: stored?.view === "month" ? "month" : "agenda",
      domains: this.sanitizeDomains(stored?.domains),
      sources: this.sanitizeSources(stored?.sources),
    };
  }

  async savePreferences(
    userId: string,
    prefs: CalendarPreferences,
  ): Promise<void> {
    const row = await this.db.query.userPreferences.findFirst({
      where: and(eq(schema.userPreferences.userId, userId)),
    });
    const settings = { ...(row?.settingsJson ?? {}) };
    settings[CALENDAR_PREFERENCES_KEY] = {
      view: prefs.view === "month" ? "month" : "agenda",
      domains: this.sanitizeDomains(prefs.domains),
      sources: this.sanitizeSources(prefs.sources),
    };
    if (row) {
      await this.db
        .update(schema.userPreferences)
        .set({ settingsJson: settings })
        .where(eq(schema.userPreferences.userId, userId));
    } else {
      await this.db
        .insert(schema.userPreferences)
        .values({ userId, settingsJson: settings });
    }
  }

  private sanitizeDomains(values: unknown): CalendarDomain[] {
    if (!Array.isArray(values)) return [...CALENDAR_DEFAULT_DOMAINS];
    const out = values.filter(
      (value): value is CalendarDomain =>
        typeof value === "string" &&
        (CALENDAR_DOMAINS as readonly string[]).includes(value),
    );
    return out.length ? out : [...CALENDAR_DEFAULT_DOMAINS];
  }

  private sanitizeSources(values: unknown): CalendarSourceId[] {
    if (!Array.isArray(values)) return [...CALENDAR_DEFAULT_SOURCES];
    const out = values.filter(
      (value): value is CalendarSourceId =>
        typeof value === "string" &&
        (CALENDAR_SOURCES as readonly string[]).includes(value),
    );
    return out.length ? out : [...CALENDAR_DEFAULT_SOURCES];
  }

  // --- Media release providers -------------------------------------------------

  private async booksAndAudiobooks(
    user: AuthUser,
    from: string,
    to: string,
    allowed: CalendarDomain[],
  ): Promise<UpcomingEvent[]> {
    const memberships = await this.db
      .select()
      .from(schema.libraryMemberships)
      .where(
        and(
          eq(schema.libraryMemberships.userId, user.id),
          inArray(schema.libraryMemberships.targetType, allowed),
        ),
      );
    if (!memberships.length) return [];

    const bookIds = memberships
      .filter((m) => m.targetType === "book")
      .map((m) => m.targetId);
    const audiobookIds = memberships
      .filter((m) => m.targetType === "audiobook")
      .map((m) => m.targetId);

    const [bookRows, audiobookRows] = await Promise.all([
      bookIds.length
        ? this.db.select().from(schema.books).where(inArray(schema.books.id, bookIds))
        : Promise.resolve([] as (typeof schema.books.$inferSelect)[]),
      audiobookIds.length
        ? this.db
            .select()
            .from(schema.audiobooks)
            .where(inArray(schema.audiobooks.id, audiobookIds))
        : Promise.resolve([] as (typeof schema.audiobooks.$inferSelect)[]),
    ]);

    const addedAt = new Map(memberships.map((m) => [m.targetId, m.addedAt]));
    const releases = await this.resolveWorkReleaseDates([
      ...bookRows.map((r) => ({ targetType: "book" as const, targetId: r.id })),
      ...audiobookRows.map((r) => ({
        targetType: "audiobook" as const,
        targetId: r.id,
      })),
    ]);

    const [authors, narrators, series, expressions] = await Promise.all([
      this.bookPeople(bookIds, "author"),
      this.bookPeople(audiobookIds, "narrator"),
      this.seriesFor(bookIds, audiobookIds),
      this.expressionMap(
        ["book", "audiobook"],
        memberships.map((m) => m.targetId),
      ),
    ]);

    const events: UpcomingEvent[] = [];
    const now = new Date();
    for (const row of bookRows) {
      const release = releases.get(row.id);
      if (!release || !releaseInWindow(release, from, to)) continue;
      events.push(
        releaseEvent({
          domain: "book",
          kind: "release",
          release,
          label: row.title,
          title: row.title,
          href: `/books/${row.slug}`,
          description: row.description,
          artworkFileId: row.coverFileId,
          workId: row.id,
          expressionId: expressions.get(row.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(row.id)?.toISOString() ?? dayStr(now),
          updatedAt: row.updatedAt.toISOString(),
          people: authors.get(row.id) ?? [],
          series: series.get(row.id) ?? [],
          reasons: ["library"],
          source: "library.book",
        }),
      );
    }
    for (const row of audiobookRows) {
      const release = releases.get(row.id);
      if (!release || !releaseInWindow(release, from, to)) continue;
      events.push(
        releaseEvent({
          domain: "audiobook",
          kind: "release",
          release,
          label: row.title,
          title: row.title,
          href: `/audiobooks/${row.slug}`,
          description: row.description,
          artworkFileId: row.coverFileId,
          workId: row.id,
          expressionId: expressions.get(row.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(row.id)?.toISOString() ?? dayStr(now),
          updatedAt: row.updatedAt.toISOString(),
          people: narrators.get(row.id) ?? [],
          series: series.get(row.id) ?? [],
          reasons: ["library"],
          source: "library.audiobook",
        }),
      );
    }
    return events;
  }

  private async resolveWorkReleaseDates(
    targets: { targetType: string; targetId: string }[],
  ): Promise<Map<string, ParsedReleaseDate>> {
    if (!targets.length) return new Map();
    const ids = [...new Set(targets.map((t) => t.targetId))];

    const rows = await this.db
      .select({
        subjectId: schema.metadataRecords.subjectId,
        subjectType: schema.metadataRecords.subjectType,
        providerKey: schema.metadataRecords.providerKey,
        payload: schema.metadataRecords.payload,
      })
      .from(schema.metadataRecords)
      .where(
        and(
          inArray(schema.metadataRecords.subjectType, ["book", "audiobook"]),
          inArray(schema.metadataRecords.subjectId, ids),
        ),
      );

    const bestPriority = new Map<string, number>();
    for (const row of rows) {
      const priority = providerPriority(row.subjectType ?? "", row.providerKey);
      if (priority < 0) continue;
      const prev = bestPriority.get(row.subjectId ?? "");
      if (prev === undefined || priority < prev) {
        bestPriority.set(row.subjectId ?? "", priority);
      }
    }
    const chosenPayload = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (
        providerPriority(row.subjectType ?? "", row.providerKey) !==
        bestPriority.get(row.subjectId ?? "")
      ) {
        continue;
      }
      if (!chosenPayload.has(row.subjectId ?? "")) {
        chosenPayload.set(row.subjectId ?? "", row.payload);
      }
    }

    const overrides = await this.db
      .select()
      .from(schema.fieldOverrides)
      .where(
        and(
          inArray(schema.fieldOverrides.subjectType, ["book", "audiobook"]),
          inArray(schema.fieldOverrides.subjectId, ids),
          inArray(schema.fieldOverrides.field, [
            "publicationDate",
            "releaseDate",
          ]),
        ),
      );
    const overrideValue = new Map<string, unknown>();
    for (const o of overrides) overrideValue.set(o.subjectId, o.value);

    const typeById = new Map(targets.map((t) => [t.targetId, t.targetType]));
    const result = new Map<string, ParsedReleaseDate>();
    for (const id of ids) {
      const override = overrideValue.get(id);
      const raw =
        override !== undefined
          ? typeof override === "string"
            ? override
            : undefined
          : chosenPayload.get(id)?.[
              typeById.get(id) === "audiobook" ? "releaseDate" : "publicationDate"
            ];
      const parsed = parseReleaseDate(raw);
      if (parsed.precision === "unknown") continue;
      result.set(id, parsed);
    }
    return result;
  }

  private async bookPeople(
    ids: string[],
    which: "author" | "narrator",
  ): Promise<Map<string, CalendarPerson[]>> {
    if (!ids.length) return new Map();
    if (which === "author") {
      const rows = await this.db
        .select({
          targetId: schema.bookAuthors.bookId,
          name: schema.bookAuthors.name,
          sortOrder: schema.bookAuthors.sortOrder,
        })
        .from(schema.bookAuthors)
        .where(inArray(schema.bookAuthors.bookId, ids))
        .orderBy(asc(schema.bookAuthors.sortOrder));
      const out = new Map<string, CalendarPerson[]>();
      for (const row of rows) {
        const list = out.get(row.targetId) ?? [];
        list.push({ name: row.name, role: "author" });
        out.set(row.targetId, list);
      }
      return out;
    }
    const rows = await this.db
      .select({
        targetId: schema.audiobookNarrators.audiobookId,
        name: schema.audiobookNarrators.name,
        sortOrder: schema.audiobookNarrators.sortOrder,
      })
      .from(schema.audiobookNarrators)
      .where(inArray(schema.audiobookNarrators.audiobookId, ids))
      .orderBy(asc(schema.audiobookNarrators.sortOrder));
    const out = new Map<string, CalendarPerson[]>();
    for (const row of rows) {
      const list = out.get(row.targetId) ?? [];
      list.push({ name: row.name, role: "narrator" });
      out.set(row.targetId, list);
    }
    return out;
  }

  private async seriesFor(
    bookIds: string[],
    audiobookIds: string[],
  ): Promise<Map<string, CalendarSeriesRef[]>> {
    const out = new Map<string, CalendarSeriesRef[]>();
    if (bookIds.length) {
      const rows = await this.db
        .select({
          targetId: schema.bookSeriesMembers.bookId,
          name: schema.bookSeries.name,
          position: schema.bookSeriesMembers.position,
        })
        .from(schema.bookSeries)
        .innerJoin(
          schema.bookSeriesMembers,
          eq(schema.bookSeriesMembers.seriesId, schema.bookSeries.id),
        )
        .where(inArray(schema.bookSeriesMembers.bookId, bookIds));
      for (const row of rows) {
        const list = out.get(row.targetId) ?? [];
        list.push({ name: row.name, position: row.position });
        out.set(row.targetId, list);
      }
    }
    if (audiobookIds.length) {
      const rows = await this.db
        .select({
          targetId: schema.audiobookSeriesMembers.audiobookId,
          name: schema.audiobookSeries.name,
          position: schema.audiobookSeriesMembers.position,
        })
        .from(schema.audiobookSeries)
        .innerJoin(
          schema.audiobookSeriesMembers,
          eq(schema.audiobookSeriesMembers.seriesId, schema.audiobookSeries.id),
        )
        .where(inArray(schema.audiobookSeriesMembers.audiobookId, audiobookIds));
      for (const row of rows) {
        const list = out.get(row.targetId) ?? [];
        list.push({ name: row.name, position: row.position });
        out.set(row.targetId, list);
      }
    }
    return out;
  }

  private async expressionMap(
    workTypes: string[],
    workIds: string[],
  ): Promise<Map<string, { expressionId: string }>> {
    if (!workIds.length) return new Map();
    const rows = await this.db
      .select({
        id: schema.creativeWorkExpressions.id,
        workType: schema.creativeWorkExpressions.workType,
        workId: schema.creativeWorkExpressions.workId,
      })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          inArray(schema.creativeWorkExpressions.workType, workTypes),
          inArray(schema.creativeWorkExpressions.workId, workIds),
        ),
      );
    const out = new Map<string, { expressionId: string }>();
    for (const row of rows) {
      if (!out.has(row.workId)) out.set(row.workId, { expressionId: row.id });
    }
    return out;
  }

  private async albums(
    user: AuthUser,
    from: string,
    to: string,
  ): Promise<UpcomingEvent[]> {
    const memberships = await this.db
      .select()
      .from(schema.libraryMemberships)
      .where(
        and(
          eq(schema.libraryMemberships.userId, user.id),
          eq(schema.libraryMemberships.targetType, "album"),
        ),
      );
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.targetId);
    const [albumRows, artistRows, expressions, addedAt] = await Promise.all([
      this.db.select().from(schema.albums).where(inArray(schema.albums.id, ids)),
      this.albumArtistNames(ids),
      this.expressionMap(["album"], ids),
      Promise.resolve(
        new Map(memberships.map((m) => [m.targetId, m.addedAt])),
      ),
    ]);
    const events: UpcomingEvent[] = [];
    const now = new Date();
    for (const album of albumRows) {
      const release = parseReleaseDate(album.releaseDate);
      if (release.precision === "unknown" || !releaseInWindow(release, from, to)) {
        continue;
      }
      events.push(
        releaseEvent({
          domain: "music",
          kind: "release",
          release,
          label: album.title,
          title: album.title,
          href: `/music/albums/${album.slug}`,
          description: album.description,
          artworkFileId: album.coverFileId,
          workId: album.id,
          expressionId: expressions.get(album.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(album.id)?.toISOString() ?? dayStr(now),
          updatedAt: album.updatedAt.toISOString(),
          people: artistRows.get(album.id) ?? [],
          reasons: ["library"],
          source: "library.album",
        }),
      );
    }
    return events;
  }

  private async albumArtistNames(
    ids: string[],
  ): Promise<Map<string, CalendarPerson[]>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({
        albumId: schema.albumArtists.albumId,
        sortOrder: schema.albumArtists.sortOrder,
        name: schema.musicArtists.name,
      })
      .from(schema.albumArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.albumArtists.artistId, schema.musicArtists.id),
      )
      .where(inArray(schema.albumArtists.albumId, ids))
      .orderBy(asc(schema.albumArtists.sortOrder));
    const out = new Map<string, CalendarPerson[]>();
    for (const row of rows) {
      const list = out.get(row.albumId) ?? [];
      list.push({ name: row.name, role: "artist" });
      out.set(row.albumId, list);
    }
    return out;
  }

  private async movies(
    user: AuthUser,
    from: string,
    to: string,
  ): Promise<UpcomingEvent[]> {
    const memberships = await this.db
      .select()
      .from(schema.libraryMemberships)
      .where(
        and(
          eq(schema.libraryMemberships.userId, user.id),
          eq(schema.libraryMemberships.targetType, "movie"),
        ),
      );
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.targetId);
    const [rows, people, expressions, addedAt] = await Promise.all([
      this.db.select().from(schema.movies).where(inArray(schema.movies.id, ids)),
      this.moviePeople(ids),
      this.expressionMap(["movie"], ids),
      Promise.resolve(
        new Map(memberships.map((m) => [m.targetId, m.addedAt])),
      ),
    ]);
    const events: UpcomingEvent[] = [];
    const now = new Date();
    for (const movie of rows) {
      const release = parseReleaseDate(movie.releaseDate);
      if (release.precision === "unknown" || !releaseInWindow(release, from, to)) {
        continue;
      }
      events.push(
        releaseEvent({
          domain: "movie",
          kind: "release",
          release,
          label: movie.title,
          title: movie.title,
          href: `/movies/${movie.slug}`,
          description: movie.description,
          artworkFileId: movie.coverFileId,
          workId: movie.id,
          expressionId: expressions.get(movie.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(movie.id)?.toISOString() ?? dayStr(now),
          updatedAt: movie.updatedAt.toISOString(),
          people: people.get(movie.id) ?? [],
          reasons: ["library"],
          source: "library.movie",
        }),
      );
    }
    return events;
  }

  private async moviePeople(
    ids: string[],
  ): Promise<Map<string, CalendarPerson[]>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({
        movieId: schema.movieCredits.movieId,
        sortOrder: schema.movieCredits.sortOrder,
        role: schema.movieCredits.role,
        name: schema.moviePeople.name,
      })
      .from(schema.movieCredits)
      .innerJoin(
        schema.moviePeople,
        eq(schema.movieCredits.personId, schema.moviePeople.id),
      )
      .where(inArray(schema.movieCredits.movieId, ids))
      .orderBy(asc(schema.movieCredits.sortOrder));
    const out = new Map<string, CalendarPerson[]>();
    for (const row of rows) {
      const list = out.get(row.movieId) ?? [];
      if (list.length < 4) list.push({ name: row.name, role: row.role });
      out.set(row.movieId, list);
    }
    return out;
  }

  private async tv(
    user: AuthUser,
    from: string,
    to: string,
  ): Promise<UpcomingEvent[]> {
    const memberships = await this.db
      .select()
      .from(schema.libraryMemberships)
      .where(
        and(
          eq(schema.libraryMemberships.userId, user.id),
          eq(schema.libraryMemberships.targetType, "show"),
        ),
      );
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.targetId);
    const addedAt = new Map(memberships.map((m) => [m.targetId, m.addedAt]));
    const [shows, expressions] = await Promise.all([
      this.db.select().from(schema.tvShows).where(inArray(schema.tvShows.id, ids)),
      this.expressionMap(["tv"], ids),
    ]);
    const showByMap = new Map(shows.map((s) => [s.id, s]));
    const events: UpcomingEvent[] = [];
    const now = new Date();

    for (const show of shows) {
      const release = parseReleaseDate(show.premiereDate);
      if (release.precision === "unknown" || !releaseInWindow(release, from, to)) {
        continue;
      }
      events.push(
        releaseEvent({
          domain: "tv",
          kind: "premiere",
          release,
          label: show.title,
          title: show.title,
          href: `/tv/shows/${show.slug}`,
          description: show.description,
          artworkFileId: show.coverFileId,
          workId: show.id,
          expressionId: expressions.get(show.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(show.id)?.toISOString() ?? dayStr(now),
          updatedAt: show.updatedAt.toISOString(),
          reasons: ["library"],
          source: "library.show",
        }),
      );
    }

    const episodes = await this.db
      .select()
      .from(schema.tvEpisodes)
      .where(
        and(
          inArray(schema.tvEpisodes.showId, ids),
          gte(schema.tvEpisodes.airDate, from),
          lte(schema.tvEpisodes.airDate, to),
        ),
      )
      .orderBy(asc(schema.tvEpisodes.airDate))
      .limit(400);

    const seasonIds = [...new Set(episodes.map((e) => e.seasonId))];
    const seasonRows = seasonIds.length
      ? await this.db
          .select({
            id: schema.tvSeasons.id,
            seasonNumber: schema.tvSeasons.seasonNumber,
          })
          .from(schema.tvSeasons)
          .where(inArray(schema.tvSeasons.id, seasonIds))
      : [];
    const seasonNumber = new Map(
      seasonRows.map((s) => [s.id, s.seasonNumber]),
    );
    for (const episode of episodes) {
      const show = showByMap.get(episode.showId);
      if (!show) continue;
      const release = parseReleaseDate(episode.airDate);
      if (release.precision === "unknown" || !releaseInWindow(release, from, to)) {
        continue;
      }
      const season = seasonNumber.get(episode.seasonId) ?? "";
      events.push(
        releaseEvent({
          domain: "tv",
          kind: "episode",
          release,
          label: `${show.title}: ${episode.title}`,
          title: episode.title,
          href: `/tv/shows/${show.slug}/s/${season}/e/${episode.episodeNumber}`,
          description: episode.description,
          artworkFileId: show.coverFileId,
          workId: show.id,
          expressionId: expressions.get(show.id)?.expressionId ?? null,
          discoveredAt: addedAt.get(show.id)?.toISOString() ?? dayStr(now),
          updatedAt: episode.updatedAt.toISOString(),
          reasons: ["library"],
          source: "library.episode",
        }),
      );
    }
    return events;
  }

  private async podcasts(
    user: AuthUser,
    from: string,
    to: string,
  ): Promise<UpcomingEvent[]> {
    const subscriptions = await this.db
      .select()
      .from(schema.podcastSubscriptions)
      .where(eq(schema.podcastSubscriptions.userId, user.id));
    if (!subscriptions.length) return [];
    const showIds = subscriptions.map((s) => s.showId);
    const subscribedAt = new Map(
      subscriptions.map((s) => [s.showId, s.subscribedAt]),
    );
    const [shows, episodes] = await Promise.all([
      this.db
        .select()
        .from(schema.podcastShows)
        .where(inArray(schema.podcastShows.id, showIds)),
      this.db
        .select()
        .from(schema.podcastEpisodes)
        .where(
          and(
            inArray(schema.podcastEpisodes.showId, showIds),
            gte(
              schema.podcastEpisodes.publishedAt,
              new Date(`${from}T00:00:00.000Z`),
            ),
            lte(
              schema.podcastEpisodes.publishedAt,
              new Date(`${to}T23:59:59.999Z`),
            ),
          ),
        )
        .orderBy(asc(schema.podcastEpisodes.publishedAt))
        .limit(400),
    ]);
    const showByMap = new Map(shows.map((s) => [s.id, s]));
    const events: UpcomingEvent[] = [];
    const now = new Date();
    for (const episode of episodes) {
      const show = showByMap.get(episode.showId);
      if (!show || !episode.publishedAt) continue;
      const release: ParsedReleaseDate = {
        precision: "day",
        day: dayStr(episode.publishedAt),
        bucket: dayStr(episode.publishedAt),
        label: null,
      };
      if (!releaseInWindow(release, from, to)) continue;
      events.push(
        releaseEvent({
          domain: "podcast",
          kind: "episode",
          release,
          label: episode.title,
          title: episode.title,
          href: `/audiobooks/podcasts/${show.slug}/${episode.slug}`,
          description: episode.description,
          artworkFileId: show.coverFileId,
          workId: show.id,
          expressionId: null,
          discoveredAt:
            subscribedAt.get(show.id)?.toISOString() ?? dayStr(now),
          updatedAt: episode.updatedAt.toISOString(),
          people: show.author ? [{ name: show.author }] : [],
          reasons: ["library"],
          source: "library.episode",
        }),
      );
    }
    return events;
  }
}