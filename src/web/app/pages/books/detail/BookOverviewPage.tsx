import { useBookDetailContext } from "./BookDetailContext";
import { YourReadingSection } from "../../../../components/books/detail/overview/YourReadingSection";
import { YourActivitySection } from "../../../../components/books/detail/overview/YourActivitySection";
import { JournalTeaserSection } from "../../../../components/books/detail/overview/JournalTeaserSection";
import { FormatsSummarySection } from "../../../../components/books/detail/overview/FormatsSummarySection";
import {
  OverviewAboutSection,
  OverviewGenresSection,
  OverviewShelvesSection,
} from "../../../../components/books/detail/overview/OverviewSections";
import { BookDetailRelatedWorks } from "../../../../components/books/detail/BookDetailRelatedWorks";
import { SeriesStrip } from "../../../../components/work-detail/SeriesStrip";
import { MyRatingSection } from "../../../../components/books/detail/overview/MyRatingSection";

export function BookOverviewPage() {
  const { book, shelves, slug, reload } = useBookDetailContext();
  if (!book) return null;

  return (
    <>
      <YourReadingSection book={book} />
      <MyRatingSection slug={slug} />
      <OverviewAboutSection description={book.description} />
      {book.series && book.seriesBooks.length > 0 && (
        <SeriesStrip seriesName={book.series.name} members={book.seriesBooks} />
      )}
      <OverviewShelvesSection
        bookId={book.id}
        shelves={shelves}
        onShelfChange={reload}
      />
      <OverviewGenresSection genres={book.genres} />
      <FormatsSummarySection book={book} />
      <BookDetailRelatedWorks book={book} />
      <JournalTeaserSection slug={slug} summary={book.journalSummary} />
      <YourActivitySection slug={slug} />
    </>
  );
}
