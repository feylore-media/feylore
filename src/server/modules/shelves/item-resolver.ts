import type { BookListItem } from "../../../shared/books.js";
import type { MovieListItem } from "../../../shared/movies.js";
import type {
  ResolvedShelfItem,
  ShelfWorkSummary,
} from "../../../shared/shelves.js";
import type { BooksService } from "../books/service.js";
import type { MoviesService } from "../movies/service.js";
import type { UnifiedShelfMember } from "./membership.js";

export class ShelfItemResolver {
  constructor(
    private readonly books: BooksService,
    private readonly movies: MoviesService,
  ) {}

  async resolveMembers(
    userId: string,
    members: UnifiedShelfMember[],
  ): Promise<ResolvedShelfItem[]> {
    const byType = new Map<string, string[]>();
    for (const m of members) {
      const list = byType.get(m.subjectType) ?? [];
      list.push(m.subjectId);
      byType.set(m.subjectType, list);
    }

    const bookMap = new Map<string, BookListItem>();
    const bookIds = byType.get("book") ?? [];
    if (bookIds.length > 0) {
      const books = await this.books.listBooksByIdsForUser(userId, bookIds);
      for (const b of books) bookMap.set(b.id, b);
    }

    const movieMap = new Map<string, MovieListItem>();
    const movieIds = byType.get("movie") ?? [];
    if (movieIds.length > 0) {
      const movies = await this.movies.listMoviesByIdsForUser(userId, movieIds);
      for (const m of movies) movieMap.set(m.id, m);
    }

    return members.map((m) => {
      let work: BookListItem | MovieListItem | ShelfWorkSummary | null = null;
      if (m.subjectType === "book") {
        work = bookMap.get(m.subjectId) ?? null;
      } else if (m.subjectType === "movie") {
        work = movieMap.get(m.subjectId) ?? null;
      } else {
        work = {
          subjectType: m.subjectType,
          subjectId: m.subjectId,
          title: m.subjectId,
        };
      }

      const book =
        m.subjectType === "book" ? (work as BookListItem | null) : null;

      return {
        subjectType: m.subjectType,
        subjectId: m.subjectId,
        sortOrder: m.sortOrder,
        addedAt: m.addedAt.toISOString(),
        membershipSources: m.membershipSources,
        work,
        book,
      };
    });
  }
}
