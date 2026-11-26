import { useCallback, useEffect, useState } from "react";
import type {
  BookAnnotationPublic,
  BookBookmarkPublic,
  BookDetail,
} from "@shared/books";
import { api } from "../../app/api";

export function useBookJournal(slug: string | undefined) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [bookmarks, setBookmarks] = useState<BookBookmarkPublic[]>([]);
  const [annotations, setAnnotations] = useState<BookAnnotationPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void Promise.all([
      api<{ data: BookDetail }>(`/books/${slug}`),
      api<{ data: BookBookmarkPublic[] }>(`/books/${slug}/bookmarks`),
      api<{ data: BookAnnotationPublic[] }>(`/books/${slug}/annotations`),
    ])
      .then(([bookRes, bookmarksRes, annotationsRes]) => {
        setBook(bookRes.data);
        setBookmarks(bookmarksRes.data);
        setAnnotations(annotationsRes.data);
      })
      .catch((e: Error) => {
        setError(e.message);
        setBook(null);
        setBookmarks([]);
        setAnnotations([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { book, bookmarks, annotations, loading, error, reload: load };
}
