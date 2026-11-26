import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { ProfileService } from "../users/profile-service.js";
import type { ProfilePlatformService } from "./service.js";
import type { GoalService } from "../goals/service.js";
import type { AchievementService } from "../achievements/service.js";
import type { AuthUser } from "../authorization/service.js";
import type {
  ProfileAchievementView,
  ProfileArtifactView,
  ProfileCardView,
  ProfileObsessionView,
  ViewerProfileView,
} from "../../../shared/profile-platform.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import { truncateProfileCardBio } from "../../../shared/user-identity.js";
import { NotFoundError } from "../../../shared/errors.js";

interface ViewDeps {
  db: Database;
  profiles: ProfileService;
  platform: ProfilePlatformService;
  goals: GoalService;
  achievements: AchievementService;
}

function workHref(domain: string, slug: string): string {
  switch (domain) {
    case "book":
      return `/books/${slug}`;
    case "audiobook":
      return `/audiobooks/${slug}`;
    case "movie":
      return `/movies/${slug}`;
    case "album":
      return `/music/albums/${slug}`;
    case "show":
      return `/tv/shows/${slug}`;
    default:
      return `/${domain}/${slug}`;
  }
}

async function resolveWorkTarget(
  db: Database,
  rawTargetId: string,
): Promise<{
  title: string;
  href: string | null;
  subtitle: string | null;
  coverFileId: string | null;
} | null> {
  // Accepted forms: "book:<id|slug>", "audiobook:..", "movie:..", "album:..",
  // "show:..", "track:..", or a bare 6-char id tried across domains.
  const colon = rawTargetId.indexOf(":");
  const domain = colon > 0 ? rawTargetId.slice(0, colon) : null;
  const ref = colon > 0 ? rawTargetId.slice(colon + 1) : rawTargetId;

  async function findBook() {
    const row =
      (await db.query.books.findFirst({ where: eq(schema.books.id, ref) })) ??
      (await db.query.books.findFirst({ where: eq(schema.books.slug, ref) }));
    return row
      ? {
          title: row.title,
          href: workHref("book", row.slug),
          subtitle: "Book",
          coverFileId: row.coverFileId ?? null,
        }
      : null;
  }
  async function findAudiobook() {
    const row =
      (await db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, ref),
      })) ??
      (await db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.slug, ref),
      }));
    return row
      ? {
          title: row.title,
          href: workHref("audiobook", row.slug),
          subtitle: "Audiobook",
          coverFileId: row.coverFileId ?? null,
        }
      : null;
  }
  async function findMovie() {
    const row =
      (await db.query.movies.findFirst({ where: eq(schema.movies.id, ref) })) ??
      (await db.query.movies.findFirst({ where: eq(schema.movies.slug, ref) }));
    return row
      ? {
          title: row.title,
          href: workHref("movie", row.slug),
          subtitle: "Movie",
          coverFileId: row.coverFileId ?? null,
        }
      : null;
  }

  if (!domain) {
    return (await findBook()) ?? (await findAudiobook()) ?? (await findMovie());
  }
  switch (domain) {
    case "book":
      return findBook();
    case "audiobook":
      return findAudiobook();
    case "movie":
      return findMovie();
    case "album": {
      const row =
        (await db.query.albums.findFirst({
          where: eq(schema.albums.id, ref),
        })) ??
        (await db.query.albums.findFirst({
          where: eq(schema.albums.slug, ref),
        }));
      return row
        ? {
            title: row.title,
            href: workHref("album", row.slug),
            subtitle: "Album",
            coverFileId: row.coverFileId ?? null,
          }
        : null;
    }
    case "show": {
      const row =
        (await db.query.tvShows.findFirst({
          where: eq(schema.tvShows.id, ref),
        })) ??
        (await db.query.tvShows.findFirst({
          where: eq(schema.tvShows.slug, ref),
        }));
      return row
        ? {
            title: row.title,
            href: workHref("show", row.slug),
            subtitle: "TV",
            coverFileId: row.coverFileId ?? null,
          }
        : null;
    }
    case "track": {
      const row = await db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.id, ref),
      });
      return row
        ? { title: row.title, href: null, subtitle: "Track", coverFileId: null }
        : null;
    }
    case "episode": {
      const row = await db.query.tvEpisodes.findFirst({
        where: eq(schema.tvEpisodes.id, ref),
      });
      return row
        ? {
            title: row.title,
            href: null,
            subtitle: "Episode",
            coverFileId: null,
          }
        : null;
    }
    default:
      return (
        (await findBook()) ?? (await findAudiobook()) ?? (await findMovie())
      );
  }
}

async function resolvePersonTarget(
  db: Database,
  targetId: string,
): Promise<{
  title: string;
  href: string | null;
  subtitle: string | null;
  photoFileId: string | null;
} | null> {
  const row =
    (await db.query.people.findFirst({
      where: eq(schema.people.id, targetId),
    })) ??
    (await db.query.people.findFirst({
      where: eq(schema.people.slug, targetId),
    }));
  if (!row) return null;
  return {
    title: row.name,
    href: `/people/${row.slug}`,
    subtitle: "Person",
    photoFileId: row.photoFileId ?? null,
  };
}

async function resolveSeriesTarget(
  db: Database,
  targetId: string,
): Promise<{
  title: string;
  href: string | null;
  subtitle: string | null;
} | null> {
  const series =
    (await db.query.bookSeries.findFirst({
      where: eq(schema.bookSeries.id, targetId),
    })) ?? null;
  if (series) return { title: series.name, href: null, subtitle: "Series" };
  const audioSeries = await db.query.audiobookSeries.findFirst({
    where: eq(schema.audiobookSeries.id, targetId),
  });
  if (audioSeries)
    return { title: audioSeries.name, href: null, subtitle: "Series" };
  return null;
}

async function resolveShelfTarget(
  db: Database,
  viewerId: string,
  ownerId: string,
  targetId: string,
): Promise<{
  title: string;
  href: string | null;
  subtitle: string | null;
  restricted: boolean;
} | null> {
  const shelf = await db.query.shelves.findFirst({
    where: eq(schema.shelves.id, targetId),
  });
  if (!shelf) return null;
  const isOwner =
    shelf.ownerUserId === viewerId || shelf.ownerUserId === ownerId;
  // Underlying permissions win: private shelves visible only to owner;
  // shared/collaborative visible to authenticated viewers.
  if (shelf.visibility === "private" && shelf.ownerUserId !== viewerId) {
    return {
      title: "Private shelf",
      href: null,
      subtitle: "Shelf",
      restricted: true,
    };
  }
  void isOwner;
  return {
    title: shelf.name,
    href: `/shelves/${shelf.id}`,
    subtitle: "Shelf",
    restricted: false,
  };
}

async function resolveClubTarget(
  db: Database,
  viewerId: string,
  targetId: string,
): Promise<{
  title: string;
  href: string | null;
  subtitle: string | null;
  restricted: boolean;
} | null> {
  const club = await db.query.clubs.findFirst({
    where: eq(schema.clubs.id, targetId),
  });
  if (!club) return null;
  if (club.visibility === "private") {
    const membership = await db.query.clubMembers.findFirst({
      where: and(
        eq(schema.clubMembers.clubId, club.id),
        eq(schema.clubMembers.userId, viewerId),
      ),
    });
    if (!membership) {
      return {
        title: "Private club",
        href: null,
        subtitle: "Club",
        restricted: true,
      };
    }
  }
  return {
    title: club.name,
    href: `/clubs/${club.id}`,
    subtitle: "Club",
    restricted: false,
  };
}

export async function resolveObsessionView(
  db: Database,
  viewerId: string,
  ownerId: string,
  row: typeof schema.profileObsessions.$inferSelect,
): Promise<ProfileObsessionView> {
  const base = {
    id: row.id,
    targetType: row.targetType as ProfileObsessionView["targetType"],
    targetId: row.targetId,
    note: row.note,
    sortOrder: row.sortOrder,
  };
  try {
    if (row.targetType === "person") {
      const resolved = await resolvePersonTarget(db, row.targetId);
      if (!resolved) throw new Error("missing");
      const { photoFileId, ...rest } = resolved;
      return {
        ...base,
        ...rest,
        coverFileId: photoFileId,
        imageKind: "portrait" as const,
        restricted: false,
      };
    }
    if (row.targetType === "series") {
      const resolved = await resolveSeriesTarget(db, row.targetId);
      if (!resolved) throw new Error("missing");
      return {
        ...base,
        ...resolved,
        coverFileId: null,
        imageKind: "none" as const,
        restricted: false,
      };
    }
    if (row.targetType === "shelf") {
      const resolved = await resolveShelfTarget(
        db,
        viewerId,
        ownerId,
        row.targetId,
      );
      if (!resolved) throw new Error("missing");
      return {
        ...base,
        ...resolved,
        coverFileId: null,
        imageKind: "none" as const,
      };
    }
    if (row.targetType === "club") {
      const resolved = await resolveClubTarget(db, viewerId, row.targetId);
      if (!resolved) throw new Error("missing");
      return {
        ...base,
        ...resolved,
        coverFileId: null,
        imageKind: "none" as const,
      };
    }
    // default: work (also supports bare ids across media domains)
    const resolved = await resolveWorkTarget(db, row.targetId);
    if (!resolved) throw new Error("missing");
    return {
      ...base,
      ...resolved,
      imageKind: "cover" as const,
      restricted: false,
    };
  } catch {
    return {
      ...base,
      title: "Unavailable",
      href: null,
      subtitle: null,
      restricted: true,
      coverFileId: null,
      imageKind: "none" as const,
    };
  }
}

async function resolveFavoriteItems(
  db: Database,
  ownerId: string,
  limit: number,
): Promise<
  Array<{
    subjectType: string;
    subjectId: string;
    title: string;
    href: string | null;
    coverFileId: string | null;
  }>
> {
  const rows = await db
    .select()
    .from(schema.userFavorites)
    .where(eq(schema.userFavorites.userId, ownerId))
    .orderBy(desc(schema.userFavorites.createdAt))
    .limit(Math.min(Math.max(limit, 1), 12));
  const items: Array<{
    subjectType: string;
    subjectId: string;
    title: string;
    href: string | null;
    coverFileId: string | null;
  }> = [];
  for (const fav of rows) {
    // Favorites reference canonical metadata, not viewer library membership.
    // File/stream endpoints remain authorization-gated, so titles are safe
    // to display whenever the profile itself is visible.
    if (fav.subjectType === "book") {
      const book = await db.query.books.findFirst({
        where: eq(schema.books.id, fav.subjectId),
      });
      if (book)
        items.push({
          subjectType: fav.subjectType,
          subjectId: fav.subjectId,
          title: book.title,
          href: workHref("book", book.slug),
          coverFileId: book.coverFileId ?? null,
        });
    } else if (fav.subjectType === "audiobook") {
      const ab = await db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, fav.subjectId),
      });
      if (ab)
        items.push({
          subjectType: fav.subjectType,
          subjectId: fav.subjectId,
          title: ab.title,
          href: workHref("audiobook", ab.slug),
          coverFileId: ab.coverFileId ?? null,
        });
    } else if (fav.subjectType === "movie") {
      const movie = await db.query.movies.findFirst({
        where: eq(schema.movies.id, fav.subjectId),
      });
      if (movie)
        items.push({
          subjectType: fav.subjectType,
          subjectId: fav.subjectId,
          title: movie.title,
          href: workHref("movie", movie.slug),
          coverFileId: movie.coverFileId ?? null,
        });
    } else if (fav.subjectType === "album") {
      const album = await db.query.albums.findFirst({
        where: eq(schema.albums.id, fav.subjectId),
      });
      if (album)
        items.push({
          subjectType: fav.subjectType,
          subjectId: fav.subjectId,
          title: album.title,
          href: workHref("album", album.slug),
          coverFileId: album.coverFileId ?? null,
        });
    } else {
      items.push({
        subjectType: fav.subjectType,
        subjectId: fav.subjectId,
        title: fav.subjectId,
        href: null,
        coverFileId: null,
      });
    }
  }
  return items;
}

async function resolveRecentFiveStar(
  db: Database,
  ownerId: string,
  limit: number,
) {
  const rows = await db
    .select()
    .from(schema.userRatings)
    .where(eq(schema.userRatings.userId, ownerId))
    .orderBy(desc(schema.userRatings.createdAt))
    .limit(50);
  // userRatings.rating is 1-10 scale; treat >=9 as five-star equivalent.
  const top = rows
    .filter((r) => r.rating >= 9)
    .slice(0, Math.min(Math.max(limit, 1), 10));
  const items: Array<{
    subjectType: string;
    subjectId: string;
    title: string;
    href: string | null;
    rating: number;
    coverFileId: string | null;
  }> = [];
  for (const rating of top) {
    if (rating.subjectType === "book") {
      const book = await db.query.books.findFirst({
        where: eq(schema.books.id, rating.subjectId),
      });
      if (book)
        items.push({
          subjectType: rating.subjectType,
          subjectId: rating.subjectId,
          title: book.title,
          href: workHref("book", book.slug),
          rating: rating.rating,
          coverFileId: book.coverFileId ?? null,
        });
    } else if (rating.subjectType === "movie") {
      const movie = await db.query.movies.findFirst({
        where: eq(schema.movies.id, rating.subjectId),
      });
      if (movie)
        items.push({
          subjectType: rating.subjectType,
          subjectId: rating.subjectId,
          title: movie.title,
          href: workHref("movie", movie.slug),
          rating: rating.rating,
          coverFileId: movie.coverFileId ?? null,
        });
    } else {
      items.push({
        subjectType: rating.subjectType,
        subjectId: rating.subjectId,
        title: rating.subjectId,
        href: null,
        rating: rating.rating,
        coverFileId: null,
      });
    }
  }
  return items;
}

async function resolveCurrentlyReading(
  db: Database,
  ownerId: string,
  limit: number,
) {
  const rows = await db
    .select()
    .from(schema.readingProgress)
    .where(eq(schema.readingProgress.userId, ownerId))
    .orderBy(desc(schema.readingProgress.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 10));
  const items: Array<{
    workType: string;
    workId: string;
    title: string;
    href: string | null;
    coverFileId: string | null;
    progressPercent: number | null;
  }> = [];
  for (const row of rows) {
    if (row.workType === "book") {
      const book = await db.query.books.findFirst({
        where: eq(schema.books.id, row.workId),
      });
      if (book)
        items.push({
          workType: row.workType,
          workId: row.workId,
          title: book.title,
          href: workHref("book", book.slug),
          coverFileId: book.coverFileId ?? null,
          progressPercent: locatorProgressPercent(row.locatorJson),
        });
    }
  }
  return items;
}

/** Extract 0-100 progress from a reading locator, if it exposes progression. */
function locatorProgressPercent(locator: unknown): number | null {
  if (typeof locator !== "object" || locator === null) return null;
  const record = locator as Record<string, unknown>;
  const raw = record.totalProgression ?? record.progression;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return Math.round(raw * 100);
}

async function resolveShelfPreview(
  db: Database,
  viewerId: string,
  ownerId: string,
  config: Record<string, unknown>,
) {
  const shelfId = typeof config.shelfId === "string" ? config.shelfId : null;
  let shelf = null as null | typeof schema.shelves.$inferSelect;
  if (shelfId) {
    shelf =
      (await db.query.shelves.findFirst({
        where: eq(schema.shelves.id, shelfId),
      })) ?? null;
  } else {
    const owned = await db
      .select()
      .from(schema.shelves)
      .where(eq(schema.shelves.ownerUserId, ownerId))
      .orderBy(desc(schema.shelves.updatedAt))
      .limit(10);
    shelf =
      owned.find(
        (s) => s.visibility !== "private" || s.ownerUserId === viewerId,
      ) ?? null;
  }
  if (!shelf) return { shelf: null, items: [], restricted: true as const };
  if (shelf.visibility === "private" && shelf.ownerUserId !== viewerId) {
    return {
      shelf: { id: shelf.id, name: "Private shelf" },
      items: [],
      restricted: true as const,
    };
  }
  const rows = await db
    .select()
    .from(schema.shelfItems)
    .where(eq(schema.shelfItems.shelfId, shelf.id))
    .orderBy(asc(schema.shelfItems.sortOrder))
    .limit(6);
  const items: Array<{
    subjectType: string;
    subjectId: string;
    title: string;
    href: string | null;
    coverFileId: string | null;
  }> = [];
  for (const row of rows) {
    const resolved = await resolveShelfSubject(
      db,
      row.subjectType,
      row.subjectId,
    );
    items.push({
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      title: resolved?.title ?? row.subjectId,
      href: resolved?.href ?? null,
      coverFileId: resolved?.coverFileId ?? null,
    });
  }
  return {
    shelf: { id: shelf.id, name: shelf.name, visibility: shelf.visibility },
    items,
    restricted: false as const,
  };
}

/** Best-effort title/art resolution for a shelf item subject. */
async function resolveShelfSubject(
  db: Database,
  subjectType: string,
  subjectId: string,
): Promise<{
  title: string;
  href: string | null;
  coverFileId: string | null;
} | null> {
  try {
    if (subjectType === "book") {
      const row = await db.query.books.findFirst({
        where: eq(schema.books.id, subjectId),
      });
      if (row)
        return {
          title: row.title,
          href: workHref("book", row.slug),
          coverFileId: row.coverFileId ?? null,
        };
    } else if (subjectType === "audiobook") {
      const row = await db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, subjectId),
      });
      if (row)
        return {
          title: row.title,
          href: workHref("audiobook", row.slug),
          coverFileId: row.coverFileId ?? null,
        };
    } else if (subjectType === "movie") {
      const row = await db.query.movies.findFirst({
        where: eq(schema.movies.id, subjectId),
      });
      if (row)
        return {
          title: row.title,
          href: workHref("movie", row.slug),
          coverFileId: row.coverFileId ?? null,
        };
    } else if (subjectType === "album") {
      const row = await db.query.albums.findFirst({
        where: eq(schema.albums.id, subjectId),
      });
      if (row)
        return {
          title: row.title,
          href: workHref("album", row.slug),
          coverFileId: row.coverFileId ?? null,
        };
    } else if (subjectType === "show") {
      const row = await db.query.tvShows.findFirst({
        where: eq(schema.tvShows.id, subjectId),
      });
      if (row)
        return {
          title: row.title,
          href: workHref("show", row.slug),
          coverFileId: row.coverFileId ?? null,
        };
    } else if (subjectType === "person") {
      const row = await db.query.people.findFirst({
        where: eq(schema.people.id, subjectId),
      });
      if (row)
        return {
          title: row.name,
          href: `/people/${row.slug}`,
          coverFileId: row.photoFileId ?? null,
        };
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveClubArtifact(
  db: Database,
  viewerId: string,
  ownerId: string,
  config: Record<string, unknown>,
) {
  const clubId = typeof config.clubId === "string" ? config.clubId : null;
  if (clubId) {
    const club = await db.query.clubs.findFirst({
      where: eq(schema.clubs.id, clubId),
    });
    if (!club) return { clubs: [] };
    if (club.visibility === "private") {
      const membership = await db.query.clubMembers.findFirst({
        where: and(
          eq(schema.clubMembers.clubId, club.id),
          eq(schema.clubMembers.userId, viewerId),
        ),
      });
      if (!membership && viewerId !== ownerId)
        return { clubs: [], restricted: true };
    }
    return {
      clubs: [{ id: club.id, name: club.name, visibility: club.visibility }],
    };
  }
  const memberships = await db
    .select({ club: schema.clubs })
    .from(schema.clubMembers)
    .innerJoin(schema.clubs, eq(schema.clubs.id, schema.clubMembers.clubId))
    .where(eq(schema.clubMembers.userId, ownerId))
    .limit(6);
  const visible = memberships
    .map((m) => m.club)
    .filter((club) => {
      if (club.visibility === "private") {
        // Only reveal private clubs to members/viewer sharing membership.
        // Checked asynchronously below; keep optimistic and filter in loop.
        return true;
      }
      return true;
    });
  const result: Array<{ id: string; name: string; visibility: string }> = [];
  for (const club of visible.slice(0, 4)) {
    if (club.visibility === "private") {
      const membership = await db.query.clubMembers.findFirst({
        where: and(
          eq(schema.clubMembers.clubId, club.id),
          eq(schema.clubMembers.userId, viewerId),
        ),
      });
      if (!membership && viewerId !== ownerId) continue;
    }
    result.push({ id: club.id, name: club.name, visibility: club.visibility });
  }
  return { clubs: result };
}

async function resolveRecentActivity(
  db: Database,
  deps: { profiles: ProfileService },
  viewerId: string,
  ownerId: string,
  limit: number,
) {
  const isOwner = viewerId === ownerId;
  const rows = await db
    .select()
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.actorUserId, ownerId))
    .orderBy(desc(schema.activityEvents.createdAt))
    .limit(20);
  const filtered = [];
  for (const event of rows) {
    if (isOwner) {
      filtered.push(event);
      continue;
    }
    if (event.visibility === "public") {
      filtered.push(event);
      continue;
    }
    if (event.visibility === "friends") {
      const owner = await db.query.users.findFirst({
        where: eq(schema.users.id, ownerId),
      });
      if (owner && (await deps.profiles.usersShareClub(viewerId, ownerId))) {
        void owner;
        filtered.push(event);
      }
      continue;
    }
    // private activity never leaks
  }
  const sliced = filtered.slice(0, Math.min(Math.max(limit, 1), 8));
  const subjects = await resolveActivitySubjects(db, sliced);
  return sliced.map((e, index) => ({
    id: e.id,
    type: e.type,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    subjectTitle: subjects[index]?.title ?? null,
    subjectHref: subjects[index]?.href ?? null,
    createdAt: e.createdAt.toISOString(),
  }));
}

async function resolveActivitySubjects(
  db: Database,
  events: Array<{ subjectType: string | null; subjectId: string | null }>,
): Promise<Array<{ title: string | null; href: string | null }>> {
  const out: Array<{ title: string | null; href: string | null }> = [];
  for (const event of events) {
    if (!event.subjectType || !event.subjectId) {
      out.push({ title: null, href: null });
      continue;
    }
    try {
      const resolved = await resolveShelfSubject(
        db,
        event.subjectType,
        event.subjectId,
      );
      if (resolved) {
        out.push({ title: resolved.title, href: resolved.href });
        continue;
      }
      if (event.subjectType === "shelf") {
        const shelf = await db.query.shelves.findFirst({
          where: eq(schema.shelves.id, event.subjectId),
        });
        if (shelf) {
          out.push({ title: shelf.name, href: `/shelves/${shelf.id}` });
          continue;
        }
      }
      if (event.subjectType === "club") {
        const club = await db.query.clubs.findFirst({
          where: eq(schema.clubs.id, event.subjectId),
        });
        if (club) {
          out.push({ title: club.name, href: `/clubs/${club.id}` });
          continue;
        }
      }
    } catch {
      // fall through to unknown subject
    }
    out.push({ title: null, href: null });
  }
  return out;
}

async function resolveStats(db: Database, ownerId: string) {
  const [favorites, ratings, shelves, follows] = await Promise.all([
    db
      .select()
      .from(schema.userFavorites)
      .where(eq(schema.userFavorites.userId, ownerId))
      .limit(1000),
    db
      .select()
      .from(schema.userRatings)
      .where(eq(schema.userRatings.userId, ownerId))
      .limit(1000),
    db
      .select()
      .from(schema.shelves)
      .where(eq(schema.shelves.ownerUserId, ownerId))
      .limit(100),
    db
      .select()
      .from(schema.profileObsessions)
      .where(eq(schema.profileObsessions.userId, ownerId))
      .limit(10),
  ]);
  return {
    favorites: favorites.length,
    ratings: ratings.length,
    shelves: shelves.length,
    obsessions: follows.length,
  };
}

async function resolveFavoritePerson(
  db: Database,
  ownerId: string,
  config: Record<string, unknown>,
) {
  const personId = typeof config.personId === "string" ? config.personId : null;
  if (personId) {
    const person = await db.query.people.findFirst({
      where: eq(schema.people.id, personId),
    });
    if (person) {
      const credit = await db.query.personCredits.findFirst({
        where: eq(schema.personCredits.peopleId, person.id),
      });
      return {
        person: {
          id: person.id,
          name: person.name,
          href: `/people/${person.slug}`,
          photoFileId: person.photoFileId ?? null,
          role: credit?.role ?? null,
        },
      };
    }
  }
  // Fallback: most-credited person in owner's favorites is out of scope;
  // return first person credit from a favorite book.
  const favorites = await db
    .select()
    .from(schema.userFavorites)
    .where(eq(schema.userFavorites.userId, ownerId))
    .limit(10);
  for (const fav of favorites) {
    if (fav.subjectType === "book") {
      const authors = await db
        .select()
        .from(schema.bookAuthors)
        .where(eq(schema.bookAuthors.bookId, fav.subjectId))
        .limit(1);
      const author = authors[0];
      if (author?.peopleId) {
        const person = await db.query.people.findFirst({
          where: eq(schema.people.id, author.peopleId),
        });
        if (person)
          return {
            person: {
              id: person.id,
              name: person.name,
              href: `/people/${person.slug}`,
              photoFileId: person.photoFileId ?? null,
              role: "Author",
            },
          };
      }
      if (author)
        return {
          person: {
            id: null,
            name: author.name,
            href: null,
            photoFileId: null,
            role: "Author",
          },
        };
    }
  }
  return { person: null };
}

export async function resolveArtifactData(
  db: Database,
  deps: { profiles: ProfileService },
  viewerId: string,
  ownerId: string,
  artifactType: string,
  config: Record<string, unknown>,
  obsessions: ProfileObsessionView[],
): Promise<Record<string, unknown> | null> {
  const limit = typeof config.limit === "number" ? config.limit : 6;
  switch (artifactType) {
    case "obsessions":
      return { items: obsessions };
    case "favorites":
      return { items: await resolveFavoriteItems(db, ownerId, limit) };
    case "favorite-quote":
      return {
        quote: typeof config.quote === "string" ? config.quote : null,
        source: typeof config.source === "string" ? config.source : null,
      };
    case "currently-reading":
      return { items: await resolveCurrentlyReading(db, ownerId, limit) };
    case "recent-five-star":
      return { items: await resolveRecentFiveStar(db, ownerId, limit) };
    case "favorite-person":
      return resolveFavoritePerson(db, ownerId, config);
    case "shelf":
    case "shelf-preview":
      return resolveShelfPreview(db, viewerId, ownerId, config);
    case "club":
      return resolveClubArtifact(db, viewerId, ownerId, config);
    case "recent-activity":
      return {
        items: await resolveRecentActivity(db, deps, viewerId, ownerId, limit),
      };
    case "stats":
      return resolveStats(db, ownerId);
    default:
      return null;
  }
}

export async function buildViewerProfileView(
  deps: ViewDeps,
  username: string,
  viewer: AuthUser,
): Promise<ViewerProfileView> {
  const { db, profiles, platform, goals, achievements } = deps;
  const viewerId = viewer.id;
  const user = await profiles.findByUsername(username);
  if (!user) throw new NotFoundError("Profile not found");
  const isOwner = viewerId === user.id;
  const canView = await profiles.canViewProfileAsync(user, viewerId);
  if (!canView) throw new NotFoundError("Profile not found");

  const [extended, links, followState, obsessionRows, artifactRows] =
    await Promise.all([
      platform.getProfileRow(user.id),
      platform.listLinks(user.id),
      platform.getFollowState(viewerId, user.id),
      platform.listObsessions(user.id),
      platform.listArtifacts(user.id),
    ]);

  const obsessions: ProfileObsessionView[] = [];
  for (const row of obsessionRows) {
    obsessions.push(await resolveObsessionView(db, viewerId, user.id, row));
  }

  const artifacts: ProfileArtifactView[] = [];
  for (const row of artifactRows) {
    if (!isOwner && !row.isVisible) continue;
    const data = await resolveArtifactData(
      db,
      { profiles },
      viewerId,
      user.id,
      row.artifactType,
      (row.config ?? {}) as Record<string, unknown>,
      obsessions,
    );
    artifacts.push({
      id: row.id,
      artifactType: row.artifactType as ProfileArtifactView["artifactType"],
      config: (row.config ?? {}) as Record<string, unknown>,
      sortOrder: row.sortOrder,
      size: (row.size as ProfileArtifactView["size"]) ?? "medium",
      isVisible: row.isVisible,
      data,
    });
  }
  artifacts.sort((a, b) => a.sortOrder - b.sortOrder);
  const profileGoals = await goals.listForProfile(user.id, isOwner);
  // Profile visibility already passed here; grant rows still go through
  // per-source visibility filtering inside the achievements service. When
  // the module is disabled the surface is hidden (empty list).
  const recentAchievements: ProfileAchievementView[] =
    (await achievements.isEnabled())
      ? await achievements.recentUserGrants({
          viewer,
          ownerId: user.id,
          viewerMaySeeProfile: true,
          limit: 6,
        })
      : [];

  return {
    username: user.username,
    displayName: user.displayName,
    pronouns: extended.pronouns ?? null,
    bio: user.bio ?? null,
    avatarUrl: profiles.avatarUrl(user.avatarFileId),
    bannerUrl: platform.bannerUrl(extended.bannerFileId ?? null),
    profileVisibility:
      user.profileVisibility as ViewerProfileView["profileVisibility"],
    isOwner,
    isFollowing: followState.isFollowing,
    counts: {
      followers: followState.followers,
      following: followState.following,
    },
    links,
    obsessions,
    artifacts,
    appearance: {
      accent: extended.accent ?? null,
      cardStyle: extended.cardStyle ?? null,
      heroTreatment: extended.heroTreatment ?? null,
      surfaceTreatment: extended.surfaceTreatment ?? null,
      customCss: extended.customCss ?? null,
      cosmetics: normalizeProfileCosmetics(extended.cosmetics),
    },
    guestbookEnabled: extended.guestbookEnabled,
    memberSince: user.createdAt ? user.createdAt.toISOString() : null,
    goals: profileGoals,
    recentAchievements,
  };
}

export async function filterFollowListForViewer(
  deps: ViewDeps,
  viewerId: string,
  rows: Array<{
    user: typeof schema.users.$inferSelect;
    cosmetics?: typeof schema.userProfiles.$inferSelect.cosmetics | null;
  }>,
) {
  const visible: Array<{
    username: string;
    displayName: string;
    avatarUrl?: string;
    cosmetics?: ReturnType<typeof normalizeProfileCosmetics> | null;
  }> = [];
  for (const row of rows) {
    const canView = await deps.profiles.canViewProfileAsync(row.user, viewerId);
    if (!canView) continue;
    visible.push({
      username: row.user.username,
      displayName: row.user.displayName,
      avatarUrl: deps.profiles.avatarUrl(row.user.avatarFileId),
      cosmetics: normalizeProfileCosmetics(row.cosmetics),
    });
  }
  return visible;
}

/**
 * Lightweight identity card for hover/focus previews.
 *
 * Same `canViewProfileAsync` gate as the full profile: a viewer who cannot
 * access the profile gets `NotFoundError`, never card metadata. Identity
 * only — no activity, ratings, or contextual event data.
 */
export async function buildProfileCardView(
  deps: ViewDeps,
  username: string,
  viewerId: string,
): Promise<ProfileCardView> {
  const { profiles, platform } = deps;
  const user = await profiles.findByUsername(username);
  if (!user) throw new NotFoundError("Profile not found");
  const canView = await profiles.canViewProfileAsync(user, viewerId);
  if (!canView) throw new NotFoundError("Profile not found");

  const [extended, followState] = await Promise.all([
    platform.getProfileRow(user.id),
    platform.getFollowState(viewerId, user.id),
  ]);

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: profiles.avatarUrl(user.avatarFileId),
    pronouns: extended.pronouns ?? null,
    bio: truncateProfileCardBio(user.bio),
    followerCount: followState.followers,
    viewerIsFollowing: followState.isFollowing,
    cosmetics: normalizeProfileCosmetics(extended.cosmetics),
  };
}
