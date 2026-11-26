import type { HomeLibraryItem } from "@shared/home";
import { BookCard } from "../books/BookCard";
import { AudiobookCard } from "../audiobooks/AudiobookCard";

interface HomeLibraryCardProps {
  entry: HomeLibraryItem;
}

export function HomeLibraryCard({ entry }: HomeLibraryCardProps) {
  if (entry.domain === "book") {
    return <BookCard book={entry.item} />;
  }
  return <AudiobookCard audiobook={entry.item} />;
}
