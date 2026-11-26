import type { BookListItem } from "@shared/books";
import type { AudiobookListItem } from "@shared/audiobooks";
import type { HomeContinueWatchingItem, HomeLibraryItem } from "@shared/home";
import { BookCard } from "../books/BookCard";
import { AudiobookCard } from "../audiobooks/AudiobookCard";
import { MovieCard } from "../movies/MovieCard";
import { TvContinueCard } from "../tv/TvContinueCard";
import { ShelfRow } from "./ShelfRow";
import { HomeLibraryCard } from "./HomeLibraryCard";

interface HomeContinueReadingProps {
  items: BookListItem[];
  title: string;
  seeAllHref: string;
  seeAllLabel: string;
}

export function HomeContinueReading({
  items,
  title,
  seeAllHref,
  seeAllLabel,
}: HomeContinueReadingProps) {
  if (items.length === 0) return null;
  return (
    <ShelfRow title={title} seeAllHref={seeAllHref} seeAllLabel={seeAllLabel}>
      {items.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </ShelfRow>
  );
}

interface HomeContinueListeningProps {
  items: AudiobookListItem[];
  title: string;
  seeAllHref: string;
  seeAllLabel: string;
}

export function HomeContinueListening({
  items,
  title,
  seeAllHref,
  seeAllLabel,
}: HomeContinueListeningProps) {
  if (items.length === 0) return null;
  return (
    <ShelfRow title={title} seeAllHref={seeAllHref} seeAllLabel={seeAllLabel}>
      {items.map((audiobook) => (
        <AudiobookCard key={audiobook.id} audiobook={audiobook} />
      ))}
    </ShelfRow>
  );
}

interface HomeContinueWatchingProps {
  items: HomeContinueWatchingItem[];
  title: string;
  seeAllHref: string;
  seeAllLabel: string;
}

export function HomeContinueWatching({
  items,
  title,
  seeAllHref,
  seeAllLabel,
}: HomeContinueWatchingProps) {
  if (items.length === 0) return null;
  return (
    <ShelfRow title={title} seeAllHref={seeAllHref} seeAllLabel={seeAllLabel}>
      {items.map((entry) =>
        entry.kind === "movie" ? (
          <MovieCard key={`movie-${entry.item.id}`} movie={entry.item} />
        ) : (
          <TvContinueCard
            key={`tv-${entry.item.episodeId}`}
            item={entry.item}
          />
        ),
      )}
    </ShelfRow>
  );
}

interface HomeLibraryRailProps {
  items: HomeLibraryItem[];
  title: string;
  seeAllHref: string;
  seeAllLabel: string;
}

export function HomeLibraryRail({
  items,
  title,
  seeAllHref,
  seeAllLabel,
}: HomeLibraryRailProps) {
  if (items.length === 0) return null;
  return (
    <ShelfRow title={title} seeAllHref={seeAllHref} seeAllLabel={seeAllLabel}>
      {items.map((entry) => (
        <HomeLibraryCard
          key={`${entry.domain}-${entry.item.id}`}
          entry={entry}
        />
      ))}
    </ShelfRow>
  );
}
