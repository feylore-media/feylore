import {
  eq,
  and,
  inArray,
  ilike,
  asc,
  desc,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../shared/subject.js";
import { slugifyTitle } from "../../../shared/media-identity.js";
import type { RepresentationService } from "../representations/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "../metadata/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { PeopleService } from "../people/service.js";
import type { JobService } from "../jobs/service.js";
import { JOB_TYPES } from "../jobs/types.js";
import type {
  AlbumListQuery,
  AlbumListItem,
  AlbumDetail,
  ArtistDetail,
  TrackListItem,
  TrackDetail,
  PlaylistPublic,
  PlaylistDetail,
} from "../../../shared/music.js";
import type { PlaybackManifest } from "../../../shared/playback.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";
import { extractMusicTagsFromFile } from "../metadata/extractors/music-tags.js";
import {
  allocateAlbumCanonicalSlug,
  allocateArtistCanonicalSlug,
  allocateTrackSlug,
  generateUniqueAlbumId,
  generateUniqueArtistId,
  getAlbumBySlug,
  getArtistBySlug,
  pendingAlbumIdentity,
  pendingArtistIdentity,
  promoteAlbumSlugIfPending,
} from "./identity.js";

const MUSIC_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "opus",
  "aac",
  "wav",
  "audio",
]);

export class MusicService {
  private jobs: JobService | undefined;

  constructor(
    private readonly db: Database,
    private readonly representations: RepresentationService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly userState: UserStateService,
    private readonly search: PostgresSearchIndex,
    private readonly people: PeopleService,
  ) {}

  setJobService(jobs: JobService) {
    this.jobs = jobs;
  }

  async createAlbum(input: {
    title: string;
    subtitle?: string;
    description?: string;
    releaseDate?: string;
    artistIds?: string[];
    artistNames?: string[];
    genres?: string[];
  }) {
    const id = await generateUniqueAlbumId(this.db);
    const canonicalSlug = await allocateAlbumCanonicalSlug(this.db, input.title);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingAlbumIdentity(id);

    await this.db.insert(schema.albums).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      releaseDate: input.releaseDate,
    });

    const artistIds = [...(input.artistIds ?? [])];
    if (input.artistNames?.length) {
      for (const name of input.artistNames) {
        const artistId = await this.findOrCreateArtistByName(name);
        if (!artistIds.includes(artistId)) artistIds.push(artistId);
      }
    }
    if (artistIds.length > 0) await this.setAlbumArtists(id, artistIds);
    if (input.genres?.length) await this.setAlbumGenres(id, input.genres);

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "album",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    await this.indexAlbum(id);
    return id;
  }

  async getAlbumManifestationId(albumId: string): Promise<string | null> {
    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "album"),
        eq(schema.creativeWorkExpressions.workId, albumId),
      ),
    });
    if (!expression) return null;

    const manifestation =
      await this.db.query.creativeWorkManifestations.findFirst({
        where: eq(schema.creativeWorkManifestations.expressionId, expression.id),
      });
    return manifestation?.id ?? null;
  }

  private async ensureAlbumWem(albumId: string): Promise<{
    expressionId: string;
    manifestationId: string;
  }> {
    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "album"),
        eq(schema.creativeWorkExpressions.workId, albumId),
      ),
    });

    let expressionId = expression?.id;
    if (!expressionId) {
      expressionId = generateId();
      await this.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "album",
        workId: albumId,
        label: "default",
      });
    }

    const manifestation =
      await this.db.query.creativeWorkManifestations.findFirst({
        where: eq(schema.creativeWorkManifestations.expressionId, expressionId),
      });

    let manifestationId = manifestation?.id;
    if (!manifestationId) {
      manifestationId = generateId();
      await this.db.insert(schema.creativeWorkManifestations).values({
        id: manifestationId,
        expressionId,
        label: "default",
      });
    }

    return { expressionId, manifestationId };
  }

  async updateAlbum(
    id: string,
    input: Partial<{
      title: string;
      subtitle: string;
      description: string;
      releaseDate: string;
    }>,
  ) {
    await this.getAlbum(id);
    await this.db
      .update(schema.albums)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.albums.id, id));
    await this.indexAlbum(id);
  }

  async deleteAlbum(id: string) {
    await this.getAlbum(id);
    const tracks = await this.db
      .select({ id: schema.musicTracks.id })
      .from(schema.musicTracks)
      .where(eq(schema.musicTracks.albumId, id));
    for (const track of tracks) {
      await this.search.remove("track", track.id);
    }
    await this.search.remove("album", id);
    await this.db.delete(schema.albums).where(eq(schema.albums.id, id));
  }

  async getAlbum(id: string) {
    const album = await this.db.query.albums.findFirst({
      where: eq(schema.albums.id, id),
    });
    if (!album) throw new NotFoundError("Album not found");
    return album;
  }

  async getAlbumByRef(ref: string) {
    return getAlbumBySlug(this.db, ref);
  }

  async ensureUserAccess(userId: string, albumId: string) {
    const membership = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    if (!membership.some((m) => m.targetId === albumId)) {
      throw new ForbiddenError("Album not in your library");
    }
  }

  async findOrCreateArtistByName(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("artist_name_required");

    const existing = await this.db
      .select({ id: schema.musicArtists.id })
      .from(schema.musicArtists)
      .where(ilike(schema.musicArtists.name, trimmed))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const id = await generateUniqueArtistId(this.db);
    const canonicalSlug = await allocateArtistCanonicalSlug(this.db, trimmed);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingArtistIdentity(id);
    const { id: peopleId } = await this.people.ensurePeopleEntity(trimmed);

    await this.db.insert(schema.musicArtists).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      name: trimmed,
      peopleId,
    });

    await this.indexArtist(id);
    return id;
  }

  async getArtist(id: string) {
    const artist = await this.db.query.musicArtists.findFirst({
      where: eq(schema.musicArtists.id, id),
    });
    if (!artist) throw new NotFoundError("Artist not found");
    return artist;
  }

  async getArtistByRef(ref: string) {
    return getArtistBySlug(this.db, ref);
  }

  async listArtistsForUser(userId: string) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    if (memberships.length === 0) return [];

    const albumIds = memberships.map((m) => m.targetId);
    const rows = await this.db
      .select({
        id: schema.musicArtists.id,
        name: schema.musicArtists.name,
        slug: schema.musicArtists.slug,
        slugStatus: schema.musicArtists.slugStatus,
        sortName: schema.musicArtists.sortName,
        peopleId: schema.musicArtists.peopleId,
        createdAt: schema.musicArtists.createdAt,
        updatedAt: schema.musicArtists.updatedAt,
      })
      .from(schema.albumArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.albumArtists.artistId, schema.musicArtists.id),
      )
      .where(inArray(schema.albumArtists.albumId, albumIds))
      .orderBy(asc(schema.musicArtists.name));

    const seen = new Set<string>();
    const artists: ReturnType<MusicService["toArtistPublic"]>[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      artists.push(this.toArtistPublic(row));
    }
    return artists;
  }

  async getArtistDetail(
    artistId: string,
    userId: string,
  ): Promise<ArtistDetail> {
    const artist = await this.getArtist(artistId);
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );

    const albumRows = await this.db
      .select({ albumId: schema.albumArtists.albumId })
      .from(schema.albumArtists)
      .where(eq(schema.albumArtists.artistId, artistId));

    const accessibleIds = albumRows
      .map((r) => r.albumId)
      .filter((id) => membershipMap.has(id));

    const albums: AlbumListItem[] = [];
    for (const albumId of accessibleIds) {
      const album = await this.getAlbum(albumId);
      albums.push(
        await this.toListItem(
          album,
          userId,
          membershipMap.get(albumId),
        ),
      );
    }

    albums.sort((a, b) => a.title.localeCompare(b.title));

    return {
      ...this.toArtistPublic(artist),
      albums,
    };
  }

  async createTrackForAlbum(
    albumId: string,
    input: {
      title: string;
      discNumber?: number;
      trackNumber?: number;
      durationSeconds?: number;
      artistNames?: string[];
    },
  ) {
    await this.getAlbum(albumId);
    const trackId = generateId();
    const slug = await allocateTrackSlug(this.db, albumId, input.title);

    await this.db.insert(schema.musicTracks).values({
      id: trackId,
      albumId,
      slug,
      title: input.title,
      discNumber: input.discNumber,
      trackNumber: input.trackNumber,
      durationSeconds: input.durationSeconds,
    });

    if (input.artistNames?.length) {
      await this.setTrackArtists(trackId, input.artistNames);
    }

    await this.indexTrack(trackId);
    await this.indexAlbum(albumId);
    return trackId;
  }

  async getTrack(trackId: string) {
    const track = await this.db.query.musicTracks.findFirst({
      where: eq(schema.musicTracks.id, trackId),
    });
    if (!track) throw new NotFoundError("Track not found");
    return track;
  }

  async getTrackDetail(trackId: string, userId: string): Promise<TrackDetail> {
    const track = await this.getTrack(trackId);
    await this.ensureUserAccess(userId, track.albumId);
    const listItem = await this.toTrackListItem(track);
    const progress = await this.userState.getProgress(userId, "track", trackId);
    return {
      ...listItem,
      userState: {
        favorite: await this.userState.getFavorite(userId, "track", trackId),
        progress:
          progress?.locator && isPlaybackProgressLocator(progress.locator)
            ? progress.locator
            : null,
        progressRepresentationId: progress?.representationId ?? null,
      },
    };
  }

  async listTracksForAlbum(albumId: string) {
    await this.getAlbum(albumId);
    return this.db
      .select()
      .from(schema.musicTracks)
      .where(eq(schema.musicTracks.albumId, albumId))
      .orderBy(
        asc(schema.musicTracks.discNumber),
        asc(schema.musicTracks.trackNumber),
        asc(schema.musicTracks.title),
      );
  }

  async deleteTrack(trackId: string) {
    const track = await this.getTrack(trackId);
    const albumId = track.albumId;
    await this.search.remove("track", trackId);
    await this.db
      .delete(schema.musicTracks)
      .where(eq(schema.musicTracks.id, trackId));
    await this.indexAlbum(albumId);
  }

  async createTrackRepresentation(params: {
    fileId: string;
    albumId: string;
    title: string;
    discNumber?: number;
    trackNumber?: number;
    durationSeconds?: number;
    userId?: string;
    artistNames?: string[];
  }) {
    const file = await this.files.getFile(params.fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!MUSIC_EXTENSIONS.has(format)) {
      throw new Error("not_a_music_format");
    }

    const existing = await this.representations.findByFileId(params.fileId);
    if (existing.length > 0) {
      const rep = existing[0]!;
      const track = await this.db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.representationId, rep.id),
      });
      const albumId = track?.albumId ?? params.albumId;
      const wem = await this.ensureAlbumWem(albumId);
      return {
        albumId,
        trackId: track?.id ?? "",
        expressionId: wem.expressionId,
        manifestationId: wem.manifestationId,
        representationId: rep.id,
        alreadyLinked: true,
      };
    }

    const wem = await this.ensureAlbumWem(params.albumId);

    const representationId = await this.representations.create({
      format,
      domainModule: "music",
      manifestationId: wem.manifestationId,
    });

    await this.representations.linkFile(
      representationId,
      params.fileId,
      "content",
      0,
    );

    const trackId = generateId();
    const slug = await allocateTrackSlug(
      this.db,
      params.albumId,
      params.title,
    );

    await this.db.insert(schema.musicTracks).values({
      id: trackId,
      albumId: params.albumId,
      slug,
      title: params.title,
      discNumber: params.discNumber,
      trackNumber: params.trackNumber,
      durationSeconds: params.durationSeconds,
      representationId,
    });

    if (params.artistNames?.length) {
      await this.setTrackArtists(trackId, params.artistNames);
    }

    if (params.userId) {
      await this.libraryMembership.ensureWorkMembership(
        params.userId,
        "album",
        params.albumId,
      );
    }

    await this.indexTrack(trackId);
    await this.indexAlbum(params.albumId);

    return {
      albumId: params.albumId,
      trackId,
      expressionId: wem.expressionId,
      manifestationId: wem.manifestationId,
      representationId,
      alreadyLinked: false,
    };
  }

  async ingestFileForPipeline(params: {
    fileId: string;
    trackTitle: string;
    albumTitle?: string;
    artistNames?: string[];
    discNumber?: number;
    trackNumber?: number;
    durationSeconds?: number;
    userId?: string;
    format?: string;
  }) {
    const file = await this.files.getFile(params.fileId);
    const format =
      params.format ?? inferFormatFromPath(file.relativePath);

    if (!MUSIC_EXTENSIONS.has(format)) {
      throw new Error("not_a_music_format");
    }

    let trackTitle = params.trackTitle;
    let albumTitle = params.albumTitle;
    let artistNames = params.artistNames;
    let discNumber = params.discNumber;
    let trackNumber = params.trackNumber;
    let durationSeconds = params.durationSeconds;

    if (!albumTitle || !artistNames?.length) {
      try {
        const tags = await extractMusicTagsFromFile(this.files, params.fileId);
        if (tags.title && !trackTitle) trackTitle = tags.title;
        if (tags.album && !albumTitle) albumTitle = tags.album;
        if (!artistNames?.length) {
          artistNames =
            tags.artists ??
            (tags.albumArtist ? [tags.albumArtist] : undefined);
        }
        discNumber ??= tags.discNumber;
        trackNumber ??= tags.trackNumber;
        durationSeconds ??= tags.durationSeconds;
      } catch {
        // use provided values
      }
    }

    if (!albumTitle) {
      albumTitle = trackTitle || titleFromPath(file.relativePath);
    }

    const albumId = await this.findOrCreateAlbumForIngest({
      title: albumTitle,
      artistNames,
    });

    const created = await this.createTrackRepresentation({
      fileId: params.fileId,
      albumId,
      title: trackTitle || albumTitle,
      discNumber,
      trackNumber,
      durationSeconds,
      userId: params.userId,
      artistNames,
    });

    return {
      albumId: created.albumId,
      trackId: created.trackId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async findTrackIdForRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const track = await this.db.query.musicTracks.findFirst({
      where: eq(schema.musicTracks.representationId, representationId),
    });
    return track?.id ?? null;
  }

  async updateTrackTitleIfUnset(trackId: string, title: string) {
    const track = await this.getTrack(trackId);
    if (track.title && track.title !== "Unknown Track") return;
    await this.db
      .update(schema.musicTracks)
      .set({ title, updatedAt: new Date() })
      .where(eq(schema.musicTracks.id, trackId));
    await this.indexTrack(trackId);
  }

  async associateFile(fileId: string, userId?: string) {
    const file = await this.files.getFile(fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!MUSIC_EXTENSIONS.has(format)) {
      return { skipped: true as const, reason: "not_a_music_format" };
    }

    const existing = await this.representations.findByFileId(fileId);
    if (existing.length > 0) {
      return {
        skipped: true as const,
        reason: "already_associated",
        representationId: existing[0]!.id,
      };
    }

    const tags = await extractMusicTagsFromFile(this.files, fileId);
    const pathParts = file.relativePath.split(/[/\\]/);
    const fileName = pathParts.pop() ?? file.relativePath;

    let trackTitle = titleFromPath(fileName);
    let albumTitle: string | undefined;
    let artistNames = tags.artists ?? (tags.albumArtist ? [tags.albumArtist] : []);

    if (pathParts.length >= 2) {
      albumTitle = pathParts[pathParts.length - 1];
      if (artistNames.length === 0) {
        artistNames = [pathParts[pathParts.length - 2]!];
      }
    } else if (pathParts.length === 1) {
      albumTitle = pathParts[0];
    }

    if (tags.title) {
      trackTitle = tags.title;
    }
    if (tags.album) {
      albumTitle = tags.album;
    }

    if (!albumTitle) {
      albumTitle = titleFromPath(fileName);
    }

    const albumId = await this.findOrCreateAlbumForIngest({
      title: albumTitle,
      artistNames,
      genres: tags.genres,
    });

    const created = await this.createTrackRepresentation({
      fileId,
      albumId,
      title: trackTitle,
      discNumber: tags.discNumber,
      trackNumber: tags.trackNumber,
      durationSeconds: tags.durationSeconds,
      userId,
      artistNames,
    });

    if (this.jobs) {
      const manifestationId = await this.getAlbumManifestationId(created.albumId);
      await this.jobs.enqueue(JOB_TYPES.METADATA_INGEST, {
        fileId,
        albumId: created.albumId,
        trackId: created.trackId,
        representationId: created.representationId,
        manifestationId,
      });
      await this.jobs.enqueue(JOB_TYPES.MEDIA_PROCESS, {
        representationId: created.representationId,
        fileId,
        domain: "music",
      });
    }

    return {
      skipped: false as const,
      albumId: created.albumId,
      trackId: created.trackId,
      representationId: created.representationId,
    };
  }

  private async findOrCreateAlbumForIngest(input: {
    title: string;
    artistNames?: string[];
    genres?: string[];
  }) {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      const id = await generateUniqueAlbumId(this.db);
      const identity = pendingAlbumIdentity(id);
      await this.db.insert(schema.albums).values({
        id: identity.id,
        slug: identity.slug,
        slugStatus: identity.slugStatus,
        title: "Unknown Album",
      });
      await this.ensureAlbumWem(id);
      await this.indexAlbum(id);
      return id;
    }

    let candidateAlbumIds: string[] | undefined;
    if (input.artistNames?.length) {
      const artistId = await this.findOrCreateArtistByName(input.artistNames[0]!);
      const rows = await this.db
        .select({ albumId: schema.albumArtists.albumId })
        .from(schema.albumArtists)
        .where(eq(schema.albumArtists.artistId, artistId));
      candidateAlbumIds = rows.map((r) => r.albumId);
    }

    const albums = await this.db
      .select()
      .from(schema.albums)
      .where(
        candidateAlbumIds?.length
          ? and(
              eq(schema.albums.title, trimmedTitle),
              inArray(schema.albums.id, candidateAlbumIds),
            )
          : eq(schema.albums.title, trimmedTitle),
      );

    if (albums[0]) return albums[0].id;

    const id = await this.createAlbum({
      title: trimmedTitle,
      artistNames: input.artistNames,
      genres: input.genres,
    });
    return id;
  }

  async findAlbumIdForTrackRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const track = await this.db.query.musicTracks.findFirst({
      where: eq(schema.musicTracks.representationId, representationId),
    });
    return track?.albumId ?? null;
  }

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const albumId = await this.findAlbumIdForTrackRepresentation(
      representationId,
    );
    if (!albumId) throw new ForbiddenError("Representation not accessible");
    await this.ensureUserAccess(userId, albumId);
    return albumId;
  }

  async listAlbumsByIdsForUser(
    userId: string,
    albumIds: string[],
  ): Promise<AlbumListItem[]> {
    if (albumIds.length === 0) return [];

    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    const accessible = albumIds.filter((id) => membershipMap.has(id));
    if (accessible.length === 0) return [];

    const albums = await this.db
      .select()
      .from(schema.albums)
      .where(inArray(schema.albums.id, accessible));
    const albumMap = new Map(albums.map((a) => [a.id, a]));

    const items: AlbumListItem[] = [];
    for (const id of albumIds) {
      const album = albumMap.get(id);
      if (album) {
        items.push(
          await this.toListItem(album, userId, membershipMap.get(id)),
        );
      }
    }
    return items;
  }

  async listTracksByIdsForUser(
    userId: string,
    trackIds: string[],
  ): Promise<TrackListItem[]> {
    if (trackIds.length === 0) return [];

    const tracks = await this.db
      .select()
      .from(schema.musicTracks)
      .where(inArray(schema.musicTracks.id, trackIds));

    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    const accessibleAlbums = new Set(memberships.map((m) => m.targetId));
    const trackMap = new Map(tracks.map((t) => [t.id, t]));

    const items: TrackListItem[] = [];
    for (const id of trackIds) {
      const track = trackMap.get(id);
      if (track && accessibleAlbums.has(track.albumId)) {
        items.push(await this.toTrackListItem(track));
      }
    }
    return items;
  }

  async listRecentlyPlayedTracksForUser(
    userId: string,
    limit: number,
  ): Promise<TrackListItem[]> {
    const progressRows = await this.db
      .select({
        subjectId: schema.userProgress.subjectId,
        updatedAt: schema.userProgress.updatedAt,
      })
      .from(schema.userProgress)
      .where(
        and(
          eq(schema.userProgress.userId, userId),
          eq(schema.userProgress.subjectType, "track"),
        ),
      )
      .orderBy(desc(schema.userProgress.updatedAt))
      .limit(limit);

    if (progressRows.length === 0) return [];

    const trackIds = progressRows.map((r) => r.subjectId);
    const tracks = await this.listTracksByIdsForUser(userId, trackIds);
    const trackMap = new Map(tracks.map((t) => [t.id, t]));

    const items: TrackListItem[] = [];
    for (const row of progressRows) {
      const track = trackMap.get(row.subjectId);
      if (track) items.push(track);
    }
    return items;
  }

  async listAllAlbumIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.albums.id })
      .from(schema.albums);
    return rows.map((r) => r.id);
  }

  async listAllTrackIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.musicTracks.id })
      .from(schema.musicTracks);
    return rows.map((r) => r.id);
  }

  async listAllArtistIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.musicArtists.id })
      .from(schema.musicArtists);
    return rows.map((r) => r.id);
  }

  async listAlbumsForUser(userId: string, query: AlbumListQuery = {} as AlbumListQuery) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    if (memberships.length === 0) {
      return { items: [] as AlbumListItem[], nextCursor: undefined };
    }

    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    let albumIds = memberships.map((m) => m.targetId);

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["album", "track", "artist"],
        limit: 200,
      });
      const searchedIds = new Set<string>();
      for (const result of searchResults.results) {
        if (result.type === "album") {
          searchedIds.add(result.id);
        } else if (result.type === "track") {
          const track = await this.db.query.musicTracks.findFirst({
            where: eq(schema.musicTracks.id, result.id),
          });
          if (track) searchedIds.add(track.albumId);
        } else if (result.type === "artist") {
          const rows = await this.db
            .select({ albumId: schema.albumArtists.albumId })
            .from(schema.albumArtists)
            .where(eq(schema.albumArtists.artistId, result.id));
          for (const row of rows) searchedIds.add(row.albumId);
        }
      }
      if (searchedIds.size > 0) {
        albumIds = albumIds.filter((id) => searchedIds.has(id));
      } else {
        albumIds = await this.search.searchAlbumsByTitle(
          this.db,
          albumIds,
          query.q,
        );
      }
    }

    if (query.artist) {
      const artistRows = await this.db
        .select({ albumId: schema.albumArtists.albumId })
        .from(schema.albumArtists)
        .innerJoin(
          schema.musicArtists,
          eq(schema.albumArtists.artistId, schema.musicArtists.id),
        )
        .where(ilike(schema.musicArtists.name, `%${query.artist}%`));
      const ids = new Set(artistRows.map((r) => r.albumId));
      albumIds = albumIds.filter((id) => ids.has(id));
    }

    if (query.genre) {
      const genreRows = await this.db
        .select({ albumId: schema.albumGenres.albumId })
        .from(schema.albumGenres)
        .where(ilike(schema.albumGenres.name, `%${query.genre}%`));
      const ids = new Set(genreRows.map((r) => r.albumId));
      albumIds = albumIds.filter((id) => ids.has(id));
    }

    if (query.favorite === true) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "album"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      albumIds = albumIds.filter((id) => favIds.has(id));
    } else if (query.favorite === false) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "album"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      albumIds = albumIds.filter((id) => !favIds.has(id));
    }

    if (albumIds.length === 0) {
      return { items: [] as AlbumListItem[], nextCursor: undefined };
    }

    const albums = await this.db
      .select()
      .from(schema.albums)
      .where(inArray(schema.albums.id, albumIds));

    const sortField = query.sort ?? "title";
    const sortOrder = query.order ?? "asc";

    if (sortField === "artist") {
      const artistNameByAlbum = new Map<string, string>();
      for (const album of albums) {
        const names = await this.getAlbumArtistNames(album.id);
        artistNameByAlbum.set(album.id, names[0] ?? "");
      }
      albums.sort((a, b) => {
        const cmp = (artistNameByAlbum.get(a.id) ?? "").localeCompare(
          artistNameByAlbum.get(b.id) ?? "",
        );
        return sortOrder === "desc" ? -cmp : cmp;
      });
    } else {
      albums.sort((a, b) => {
        let cmp = 0;
        if (sortField === "title") {
          cmp = a.title.localeCompare(b.title);
        } else if (sortField === "updatedAt") {
          cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
        } else if (sortField === "addedAt") {
          const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
          const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
          cmp = aAdded - bAdded;
        } else if (sortField === "releaseDate") {
          cmp = (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "");
        }
        return sortOrder === "desc" ? -cmp : cmp;
      });
    }

    if (query.view === "recent") {
      albums.sort((a, b) => {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        return bAdded - aAdded;
      });
    }

    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const page = albums.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const pageAlbums = hasMore ? page.slice(0, limit) : page;

    const items = await Promise.all(
      pageAlbums.map((album) =>
        this.toListItem(album, userId, membershipMap.get(album.id)),
      ),
    );

    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async getAlbumDetail(albumId: string, userId?: string): Promise<AlbumDetail> {
    const album = await this.getAlbum(albumId);
    const artistRows = await this.db
      .select({ artist: schema.musicArtists })
      .from(schema.albumArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.albumArtists.artistId, schema.musicArtists.id),
      )
      .where(eq(schema.albumArtists.albumId, albumId))
      .orderBy(asc(schema.albumArtists.sortOrder));

    const genres = await this.getAlbumGenreNames(albumId);
    const trackRows = await this.listTracksForAlbum(albumId);
    const tracks = await Promise.all(
      trackRows.map((track) => this.toTrackListItem(track)),
    );

    const overrides = await this.metadata.getOverrides("album", albumId);
    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }
    const effective = this.applyAlbumOverrides(album, overrideMap);

    let userState = { favorite: false };
    if (userId) {
      userState = {
        favorite: await this.userState.getFavorite(userId, "album", albumId),
      };
    }

    return {
      ...this.toPublic(effective),
      artists: artistRows.map((row) => this.toArtistPublic(row.artist)),
      genres,
      tracks,
      userState,
    };
  }

  async setAlbumArtists(albumId: string, artistIds: string[]) {
    await this.getAlbum(albumId);

    const artists: Array<{ id: string; name: string }> = [];
    for (const artistId of artistIds) {
      const artist = await this.getArtist(artistId);
      if (!artist.peopleId) {
        const { id } = await this.people.ensurePeopleEntity(artist.name);
        await this.db
          .update(schema.musicArtists)
          .set({ peopleId: id })
          .where(eq(schema.musicArtists.id, artistId));
      }
      artists.push({ id: artist.id, name: artist.name });
    }

    await this.people.syncTargetCredits(
      "album",
      albumId,
      artists.map((a, i) => ({ name: a.name, role: "artist", sortOrder: i })),
    );

    await this.db
      .delete(schema.albumArtists)
      .where(eq(schema.albumArtists.albumId, albumId));
    for (let i = 0; i < artistIds.length; i++) {
      await this.db.insert(schema.albumArtists).values({
        id: generateId(),
        albumId,
        artistId: artistIds[i]!,
        sortOrder: i,
      });
    }
    await this.indexAlbum(albumId);
  }

  async setAlbumGenres(albumId: string, genres: string[]) {
    await this.getAlbum(albumId);
    await this.db
      .delete(schema.albumGenres)
      .where(eq(schema.albumGenres.albumId, albumId));
    for (const name of genres) {
      await this.db.insert(schema.albumGenres).values({
        id: generateId(),
        albumId,
        name,
      });
    }
    await this.indexAlbum(albumId);
  }

  private async setTrackArtists(trackId: string, artistNames: string[]) {
    await this.db
      .delete(schema.trackArtists)
      .where(eq(schema.trackArtists.trackId, trackId));
    for (let i = 0; i < artistNames.length; i++) {
      const artistId = await this.findOrCreateArtistByName(artistNames[i]!);
      await this.db.insert(schema.trackArtists).values({
        id: generateId(),
        trackId,
        artistId,
        sortOrder: i,
      });
    }
    await this.indexTrack(trackId);
  }

  async applyIngestedMetadata(
    albumId: string,
    sources: {
      merged: Partial<{
        title: string;
        subtitle: string;
        description: string;
        releaseDate: string;
        artists: string[];
        genres: string[];
      }>;
    },
  ) {
    const album = await this.getAlbum(albumId);
    const overrides = await this.metadata.getOverrides("album", albumId);
    const overriddenFields = new Set(overrides.map((o) => o.field));
    const merged = sources.merged;

    const updates: Partial<{
      title: string;
      subtitle: string;
      description: string;
      releaseDate: string;
    }> = {};

    if (!overriddenFields.has("title") && merged.title) {
      updates.title = merged.title;
    }
    if (!overriddenFields.has("subtitle") && merged.subtitle) {
      updates.subtitle = merged.subtitle;
    }
    if (!overriddenFields.has("description") && merged.description) {
      updates.description = merged.description;
    }
    if (!overriddenFields.has("releaseDate") && merged.releaseDate) {
      updates.releaseDate = merged.releaseDate;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(schema.albums)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.albums.id, albumId));
    }

    if (!overriddenFields.has("artists") && merged.artists?.length) {
      const artistIds: string[] = [];
      for (const name of merged.artists) {
        artistIds.push(await this.findOrCreateArtistByName(name));
      }
      await this.setAlbumArtists(albumId, artistIds);
    }
    if (!overriddenFields.has("genres") && merged.genres?.length) {
      await this.setAlbumGenres(albumId, merged.genres);
    }

    const titleForSlug = updates.title ?? album.title;
    await promoteAlbumSlugIfPending(this.db, albumId, titleForSlug);
    await this.indexAlbum(albumId);
  }

  async indexAlbum(albumId: string) {
    const album = await this.getAlbum(albumId);
    const artists = await this.getAlbumArtistNames(albumId);
    const genres = await this.getAlbumGenreNames(albumId);
    await this.search.upsert({
      entityType: "album",
      entityId: albumId,
      title: album.title,
      body: [album.subtitle, album.description, ...artists, ...genres]
        .filter(Boolean)
        .join(" "),
    });
  }

  async indexTrack(trackId: string) {
    const track = await this.getTrack(trackId);
    const album = await this.getAlbum(track.albumId);
    const artists = await this.getTrackArtistNames(trackId);
    await this.search.upsert({
      entityType: "track",
      entityId: trackId,
      title: track.title,
      body: [album.title, ...artists].filter(Boolean).join(" "),
    });
  }

  async indexArtist(artistId: string) {
    const artist = await this.getArtist(artistId);
    await this.search.upsert({
      entityType: "artist",
      entityId: artistId,
      title: artist.name,
      body: artist.sortName ?? "",
    });
  }

  async findDuplicateAlbumByChecksum(
    checksum: string,
  ): Promise<{ workType: "album"; workId: string } | null> {
    const sameChecksum = await this.db
      .select({ albumId: schema.musicTracks.albumId })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(schema.representationFiles.representationId, schema.representations.id),
      )
      .innerJoin(
        schema.musicTracks,
        eq(schema.musicTracks.representationId, schema.representations.id),
      )
      .innerJoin(schema.files, eq(schema.representationFiles.fileId, schema.files.id))
      .where(eq(schema.files.checksum, checksum))
      .limit(1);
    if (sameChecksum[0]) {
      return { workType: "album", workId: sameChecksum[0].albumId };
    }
    return null;
  }

  async listGenresForUser(userId: string) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "album",
    );
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.targetId);
    const rows = await this.db
      .select({ name: schema.albumGenres.name })
      .from(schema.albumGenres)
      .where(inArray(schema.albumGenres.albumId, ids));
    return [...new Set(rows.map((r) => r.name))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async createPlaylist(
    userId: string,
    input: { name: string; description?: string },
  ) {
    const id = generateId();
    const slug = await this.allocatePlaylistSlug(userId, input.name);
    await this.db.insert(schema.musicPlaylists).values({
      id,
      userId,
      slug,
      name: input.name,
      description: input.description,
    });
    return id;
  }

  async updatePlaylist(
    userId: string,
    playlistSlug: string,
    input: Partial<{ name: string; description: string }>,
  ) {
    const playlist = await this.getPlaylistByRef(userId, playlistSlug);
    const updates: Partial<{
      name: string;
      description: string;
      slug: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      updates.name = input.name;
      updates.slug = await this.allocatePlaylistSlug(
        userId,
        input.name,
        playlist.id,
      );
    }
    if (input.description !== undefined) {
      updates.description = input.description;
    }
    await this.db
      .update(schema.musicPlaylists)
      .set(updates)
      .where(eq(schema.musicPlaylists.id, playlist.id));
  }

  async deletePlaylist(userId: string, playlistSlug: string) {
    const playlist = await this.getPlaylistByRef(userId, playlistSlug);
    await this.db
      .delete(schema.musicPlaylists)
      .where(eq(schema.musicPlaylists.id, playlist.id));
  }

  async listPlaylistsForUser(userId: string): Promise<PlaylistPublic[]> {
    const rows = await this.db
      .select()
      .from(schema.musicPlaylists)
      .where(eq(schema.musicPlaylists.userId, userId))
      .orderBy(asc(schema.musicPlaylists.name));
    return Promise.all(rows.map((row) => this.toPlaylistPublic(row)));
  }

  async getPlaylistByRef(userId: string, slug: string) {
    const playlist = await this.db.query.musicPlaylists.findFirst({
      where: and(
        eq(schema.musicPlaylists.userId, userId),
        eq(schema.musicPlaylists.slug, slug),
      ),
    });
    if (!playlist) throw new NotFoundError("Playlist not found");
    return playlist;
  }

  async getPlaylistDetail(
    userId: string,
    slug: string,
  ): Promise<PlaylistDetail> {
    const playlist = await this.getPlaylistByRef(userId, slug);
    const trackRows = await this.db
      .select({ track: schema.musicTracks })
      .from(schema.musicPlaylistTracks)
      .innerJoin(
        schema.musicTracks,
        eq(schema.musicPlaylistTracks.trackId, schema.musicTracks.id),
      )
      .where(eq(schema.musicPlaylistTracks.playlistId, playlist.id))
      .orderBy(asc(schema.musicPlaylistTracks.position));

    const tracks = await Promise.all(
      trackRows.map((row) => this.toTrackListItem(row.track)),
    );

    return {
      ...(await this.toPlaylistPublic(playlist)),
      tracks,
    };
  }

  async addTrackToPlaylist(
    userId: string,
    playlistSlug: string,
    trackId: string,
  ) {
    const playlist = await this.getPlaylistByRef(userId, playlistSlug);
    const track = await this.getTrack(trackId);
    await this.ensureUserAccess(userId, track.albumId);

    const existing = await this.db.query.musicPlaylistTracks.findFirst({
      where: and(
        eq(schema.musicPlaylistTracks.playlistId, playlist.id),
        eq(schema.musicPlaylistTracks.trackId, trackId),
      ),
    });
    if (existing) return;

    const maxPos = await this.db
      .select({
        max: sql<number>`coalesce(max(${schema.musicPlaylistTracks.position}), -1)`,
      })
      .from(schema.musicPlaylistTracks)
      .where(eq(schema.musicPlaylistTracks.playlistId, playlist.id));

    await this.db.insert(schema.musicPlaylistTracks).values({
      id: generateId(),
      playlistId: playlist.id,
      trackId,
      position: (maxPos[0]?.max ?? -1) + 1,
    });
    await this.db
      .update(schema.musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(schema.musicPlaylists.id, playlist.id));
  }

  async removeTrackFromPlaylist(
    userId: string,
    playlistSlug: string,
    trackId: string,
  ) {
    const playlist = await this.getPlaylistByRef(userId, playlistSlug);
    await this.db
      .delete(schema.musicPlaylistTracks)
      .where(
        and(
          eq(schema.musicPlaylistTracks.playlistId, playlist.id),
          eq(schema.musicPlaylistTracks.trackId, trackId),
        ),
      );
    await this.db
      .update(schema.musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(schema.musicPlaylists.id, playlist.id));
  }

  async reorderPlaylistTracks(
    userId: string,
    playlistSlug: string,
    trackIds: string[],
  ) {
    const playlist = await this.getPlaylistByRef(userId, playlistSlug);
    for (let i = 0; i < trackIds.length; i++) {
      await this.db
        .update(schema.musicPlaylistTracks)
        .set({ position: i })
        .where(
          and(
            eq(schema.musicPlaylistTracks.playlistId, playlist.id),
            eq(schema.musicPlaylistTracks.trackId, trackIds[i]!),
          ),
        );
    }
    await this.db
      .update(schema.musicPlaylists)
      .set({ updatedAt: new Date() })
      .where(eq(schema.musicPlaylists.id, playlist.id));
  }

  async getPlaybackManifestsForAlbum(
    albumId: string,
    userId: string,
  ): Promise<PlaybackManifest[]> {
    await this.ensureUserAccess(userId, albumId);
    const album = await this.getAlbum(albumId);
    const artistNames = await this.getAlbumArtistNames(albumId);
    const subtitle = artistNames.join(", ") || undefined;
    const tracks = await this.listTracksForAlbum(albumId);
    const manifests: PlaybackManifest[] = [];

    for (const track of tracks) {
      if (!track.representationId) continue;
      const rep = await this.representations.get(track.representationId);
      if (rep.unavailableAt) continue;

      const fileLinks =
        await this.representations.listFilesForRepresentation(
          track.representationId,
        );
      if (fileLinks.length === 0) continue;

      const sources = await Promise.all(
        fileLinks.map(async (link) => {
          const file = await this.files.getFile(link.fileId);
          const durationSeconds =
            track.durationSeconds ??
            (await this.getFileDurationSeconds(link.fileId)) ??
            undefined;
          return {
            fileId: file.id,
            url: `/api/v1/files/${file.id}/content`,
            mimeType: file.mediaType ?? undefined,
            durationSeconds,
          };
        }),
      );

      manifests.push({
        subject: { type: "track", id: track.id },
        representationId: track.representationId,
        title: track.title,
        subtitle: `${album.title}${subtitle ? ` — ${subtitle}` : ""}`,
        mediaKind: "audio",
        sources,
        sessionMode: "persistent",
      });
    }

    return manifests;
  }

  private async allocatePlaylistSlug(
    userId: string,
    name: string,
    excludePlaylistId?: string,
  ): Promise<string> {
    const base = slugifyTitle(name) ?? `playlist-${Date.now()}`;
    let candidate = base;
    let n = 2;
    while (true) {
      const existing = await this.db.query.musicPlaylists.findFirst({
        where: and(
          eq(schema.musicPlaylists.userId, userId),
          eq(schema.musicPlaylists.slug, candidate),
        ),
      });
      if (!existing || existing.id === excludePlaylistId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  private async toPlaylistPublic(
    playlist: typeof schema.musicPlaylists.$inferSelect,
  ): Promise<PlaylistPublic> {
    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.musicPlaylistTracks)
      .where(eq(schema.musicPlaylistTracks.playlistId, playlist.id));
    return {
      id: playlist.id,
      slug: playlist.slug,
      name: playlist.name,
      description: playlist.description,
      trackCount: countRows[0]?.count ?? 0,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
    };
  }

  private async toListItem(
    album: typeof schema.albums.$inferSelect,
    userId: string,
    addedAt?: Date,
  ): Promise<AlbumListItem> {
    const artists = await this.getAlbumArtistNames(album.id);
    const genres = await this.getAlbumGenreNames(album.id);
    const favorite = await this.userState.getFavorite(
      userId,
      "album",
      album.id,
    );
    const trackCountRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.musicTracks)
      .where(eq(schema.musicTracks.albumId, album.id));

    return {
      ...this.toPublic(album),
      artists,
      genres,
      favorite,
      addedAt: addedAt?.toISOString() ?? null,
      trackCount: trackCountRows[0]?.count ?? 0,
    };
  }

  private async toTrackListItem(
    track: typeof schema.musicTracks.$inferSelect,
  ): Promise<TrackListItem> {
    const album = await this.getAlbum(track.albumId);
    const artists = await this.getTrackArtistNames(track.id);
    return {
      id: track.id,
      albumId: track.albumId,
      slug: track.slug,
      title: track.title,
      discNumber: track.discNumber,
      trackNumber: track.trackNumber,
      durationSeconds: track.durationSeconds,
      representationId: track.representationId,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
      albumTitle: album.title,
      albumSlug: album.slug,
      artists,
    };
  }

  async getAlbumArtistNames(albumId: string) {
    const rows = await this.db
      .select({ name: schema.musicArtists.name })
      .from(schema.albumArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.albumArtists.artistId, schema.musicArtists.id),
      )
      .where(eq(schema.albumArtists.albumId, albumId))
      .orderBy(asc(schema.albumArtists.sortOrder));
    return rows.map((r) => r.name);
  }

  private async getTrackArtistNames(trackId: string) {
    const rows = await this.db
      .select({ name: schema.musicArtists.name })
      .from(schema.trackArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.trackArtists.artistId, schema.musicArtists.id),
      )
      .where(eq(schema.trackArtists.trackId, trackId))
      .orderBy(asc(schema.trackArtists.sortOrder));
    if (rows.length > 0) return rows.map((r) => r.name);
    const track = await this.getTrack(trackId);
    return this.getAlbumArtistNames(track.albumId);
  }

  private async getAlbumGenreNames(albumId: string) {
    const rows = await this.db
      .select({ name: schema.albumGenres.name })
      .from(schema.albumGenres)
      .where(eq(schema.albumGenres.albumId, albumId));
    return rows.map((r) => r.name);
  }

  private async getFileDurationSeconds(
    fileId: string,
  ): Promise<number | null> {
    const technical = await this.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, fileId),
    });
    const duration = technical?.payload?.durationSeconds;
    return typeof duration === "number" ? duration : null;
  }

  private applyAlbumOverrides(
    album: typeof schema.albums.$inferSelect,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...album,
      title: (overrides.title as string) ?? album.title,
      subtitle:
        (overrides.subtitle as string | undefined) ?? album.subtitle,
      description:
        (overrides.description as string | undefined) ?? album.description,
      releaseDate:
        (overrides.releaseDate as string | undefined) ?? album.releaseDate,
    };
  }

  toPublic(album: typeof schema.albums.$inferSelect) {
    return {
      id: album.id,
      slug: album.slug,
      slugStatus: album.slugStatus as "pending" | "canonical",
      title: album.title,
      subtitle: album.subtitle,
      description: album.description,
      releaseDate: album.releaseDate,
      coverFileId: album.coverFileId,
      createdAt: album.createdAt.toISOString(),
      updatedAt: album.updatedAt.toISOString(),
    };
  }

  toArtistPublic(artist: typeof schema.musicArtists.$inferSelect) {
    return {
      id: artist.id,
      slug: artist.slug,
      slugStatus: artist.slugStatus as "pending" | "canonical",
      name: artist.name,
      sortName: artist.sortName,
      peopleId: artist.peopleId,
      createdAt: artist.createdAt.toISOString(),
      updatedAt: artist.updatedAt.toISOString(),
    };
  }
}
