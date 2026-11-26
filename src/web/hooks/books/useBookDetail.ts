import { useCallback, useEffect, useState } from "react";
import type { BookDetail } from "@shared/books";
import type { ShelfPublic } from "@shared/shelves";
import { api } from "../../app/api";

export function useBookDetail(slug: string | undefined) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [shelves, setShelves] = useState<ShelfPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void Promise.all([
      api<{ data: BookDetail }>(`/books/${slug}`),
      api<{ data: ShelfPublic[] }>(`/books/${slug}/shelves`).catch(() => ({
        data: [] as ShelfPublic[],
      })),
    ])
      .then(([bookRes, shelvesRes]) => {
        setBook(bookRes.data);
        setShelves(shelvesRes.data);
      })
      .catch((e: Error) => {
        setError(e.message);
        setBook(null);
        setShelves([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const updateBook = useCallback((patch: Partial<BookDetail>) => {
    setBook((b) => (b ? { ...b, ...patch } : b));
  }, []);

  const updateUserState = useCallback(
    (patch: Partial<BookDetail["userState"]>) => {
      setBook((b) =>
        b ? { ...b, userState: { ...b.userState, ...patch } } : b,
      );
    },
    [],
  );

  return {
    book,
    shelves,
    loading,
    error,
    reload: load,
    updateBook,
    updateUserState,
  };
}
