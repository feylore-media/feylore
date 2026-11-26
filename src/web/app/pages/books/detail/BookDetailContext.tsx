import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router";
import type { BookDetail } from "@shared/books";
import type { ShelfPublic } from "@shared/shelves";
import { api } from "../../../api";
import { useBookDetail } from "../../../../hooks/books/useBookDetail";
import {
  useBookMetadataFetch,
  type MetadataFetchStatus,
} from "../../../../hooks/books/useBookMetadataFetch";

interface BookDetailContextValue {
  slug: string;
  book: BookDetail | null;
  shelves: ShelfPublic[];
  loading: boolean;
  error: string | null;
  rating: number | null;
  setRating: (rating: number | null) => void;
  reload: () => void;
  updateBook: (patch: Partial<BookDetail>) => void;
  updateUserState: (patch: Partial<BookDetail["userState"]>) => void;
  toggleFavorite: () => Promise<void>;
  metadataFetchStatus: MetadataFetchStatus;
}

const BookDetailContext = createContext<BookDetailContextValue | null>(null);

export function BookDetailProvider({ children }: { children: ReactNode }) {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugParam ?? "";
  const {
    book,
    shelves,
    loading,
    error,
    reload,
    updateBook,
    updateUserState,
  } = useBookDetail(slug);
  const { status: metadataFetchStatus } = useBookMetadataFetch(slug, {
    onComplete: reload,
  });
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    if (book) setRating(book.userState.rating);
  }, [book]);

  const toggleFavorite = useCallback(async () => {
    if (!book) return;
    const next = !book.userState.favorite;
    await api(`/books/${book.slug}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite: next }),
    });
    updateUserState({ favorite: next });
  }, [book, updateUserState]);

  const value = useMemo(
    () => ({
      slug,
      book,
      shelves,
      loading,
      error,
      rating,
      setRating,
      reload,
      updateBook,
      updateUserState,
      toggleFavorite,
      metadataFetchStatus,
    }),
    [
      slug,
      book,
      shelves,
      loading,
      error,
      rating,
      reload,
      updateBook,
      updateUserState,
      toggleFavorite,
      metadataFetchStatus,
    ],
  );

  return (
    <BookDetailContext.Provider value={value}>
      {children}
    </BookDetailContext.Provider>
  );
}

export function useBookDetailContext() {
  const ctx = useContext(BookDetailContext);
  if (!ctx) {
    throw new Error("useBookDetailContext must be used within BookDetailProvider");
  }
  return ctx;
}
