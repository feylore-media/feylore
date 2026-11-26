import { eq, and, sql, inArray, or, ilike } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { SearchIndex, SearchQuery, SearchResult } from "./types.js";

export class PostgresSearchIndex implements SearchIndex {
  constructor(private readonly db: Database) {}

  private requireDb(): Database {
    return this.db;
  }

  async upsert(doc: {
    entityType: string;
    entityId: string;
    title: string;
    body?: string;
  }): Promise<void> {
    const db = this.requireDb();
    const existing = await db.query.searchDocuments.findFirst({
      where: and(
        eq(schema.searchDocuments.entityType, doc.entityType),
        eq(schema.searchDocuments.entityId, doc.entityId),
      ),
    });
    const body = doc.body ?? "";

    if (existing) {
      await db
        .update(schema.searchDocuments)
        .set({ title: doc.title, body })
        .where(eq(schema.searchDocuments.id, existing.id));
    } else {
      await db.insert(schema.searchDocuments).values({
        id: generateId(),
        entityType: doc.entityType,
        entityId: doc.entityId,
        title: doc.title,
        body,
      });
    }
  }

  async remove(entityType: string, entityId: string): Promise<void> {
    const db = this.requireDb();
    await db
      .delete(schema.searchDocuments)
      .where(
        and(
          eq(schema.searchDocuments.entityType, entityType),
          eq(schema.searchDocuments.entityId, entityId),
        ),
      );
  }

  async query(
    query: SearchQuery,
  ): Promise<{ results: SearchResult[]; nextCursor?: string }> {
    const db = this.requireDb();
    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;

    if (!query.q.trim()) {
      return { results: [] };
    }

    const conditions = [
      sql`to_tsvector('english', coalesce(${schema.searchDocuments.title}, '') || ' ' || coalesce(${schema.searchDocuments.body}, '')) @@ plainto_tsquery('english', ${query.q})`,
    ];

    if (query.types && query.types.length > 0) {
      conditions.push(inArray(schema.searchDocuments.entityType, query.types));
    }

    const rows = await db
      .select({
        entityType: schema.searchDocuments.entityType,
        entityId: schema.searchDocuments.entityId,
        title: schema.searchDocuments.title,
        body: schema.searchDocuments.body,
      })
      .from(schema.searchDocuments)
      .where(and(...conditions))
      .orderBy(
        sql`ts_rank(to_tsvector('english', coalesce(${schema.searchDocuments.title}, '') || ' ' || coalesce(${schema.searchDocuments.body}, '')), plainto_tsquery('english', ${query.q})) DESC`,
      )
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      results: page.map((r) => ({
        type: r.entityType,
        id: r.entityId,
        title: r.title,
        snippet: r.body?.slice(0, 120) ?? undefined,
      })),
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async searchBooksByTitle(
    db: Database,
    bookIds: string[],
    q: string,
  ): Promise<string[]> {
    if (bookIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(
        and(
          inArray(schema.books.id, bookIds),
          or(
            ilike(schema.books.title, pattern),
            ilike(schema.books.subtitle, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  async searchAudiobooksByTitle(
    db: Database,
    audiobookIds: string[],
    q: string,
  ): Promise<string[]> {
    if (audiobookIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.audiobooks.id })
      .from(schema.audiobooks)
      .where(
        and(
          inArray(schema.audiobooks.id, audiobookIds),
          or(
            ilike(schema.audiobooks.title, pattern),
            ilike(schema.audiobooks.subtitle, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  async searchMoviesByTitle(
    db: Database,
    movieIds: string[],
    q: string,
  ): Promise<string[]> {
    if (movieIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.movies.id })
      .from(schema.movies)
      .where(
        and(
          inArray(schema.movies.id, movieIds),
          or(
            ilike(schema.movies.title, pattern),
            ilike(schema.movies.subtitle, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  async searchAlbumsByTitle(
    db: Database,
    albumIds: string[],
    q: string,
  ): Promise<string[]> {
    if (albumIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.albums.id })
      .from(schema.albums)
      .where(
        and(
          inArray(schema.albums.id, albumIds),
          or(
            ilike(schema.albums.title, pattern),
            ilike(schema.albums.subtitle, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  async searchTracksByTitle(
    db: Database,
    trackIds: string[],
    q: string,
  ): Promise<string[]> {
    if (trackIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.musicTracks.id })
      .from(schema.musicTracks)
      .where(
        and(
          inArray(schema.musicTracks.id, trackIds),
          ilike(schema.musicTracks.title, pattern),
        ),
      );
    return rows.map((r) => r.id);
  }

  async searchArtistsByTitle(
    db: Database,
    artistIds: string[],
    q: string,
  ): Promise<string[]> {
    if (artistIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await db
      .select({ id: schema.musicArtists.id })
      .from(schema.musicArtists)
      .where(
        and(
          inArray(schema.musicArtists.id, artistIds),
          or(
            ilike(schema.musicArtists.name, pattern),
            ilike(schema.musicArtists.sortName, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }
}
