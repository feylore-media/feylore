import { readingLocatorSchema } from "@shared/books";
import { ShareWithClub } from "../../components/clubs/ShareWithClub";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import {
  ReaderSessionProvider,
  useReaderSession,
} from "../../../reader/session/ReaderSessionContext";
import {
  ReaderChrome,
  ReaderErrorState,
} from "../../../reader/chrome/ReaderChrome";
import { bookPath, bookReaderPath } from "../../../routes/paths";
import styles from "../../../reader/reader.module.css";

function ReaderContent({
  containerRef,
  slug,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  slug: string;
}) {
  const { t } = useTranslation("books");
  const navigate = useNavigate();
  const {
    state,
    goTo,
    goNext,
    goPrevious,
    setPanel,
    toggleControls,
    setTypography,
    addBookmark,
    removeBookmark,
    createAnnotation,
    deleteAnnotation,
    playOverlay,
    pauseOverlay,
    overlayNextSegment,
    overlayPreviousSegment,
    toggleTts,
    clearSelection,
  } = useReaderSession();

  const jumped = useRef(false);
  useEffect(() => {
    if (state.loading || !state.capabilities || jumped.current) return;
    const raw = new URLSearchParams(location.search).get("locator");
    jumped.current = true;
    if (!raw) return;
    try {
      const locator = readingLocatorSchema.parse(JSON.parse(raw));
      if (locator.href || locator.cfi) void goTo(locator);
    } catch {
      /* Invalid canonical jumps are ignored. */
    }
  }, [state.loading, state.capabilities, goTo]);
  const progressLabel =
    state.currentLocator?.totalProgression != null
      ? `${Math.round(state.currentLocator.totalProgression * 100)}%`
      : (state.currentLocator?.title ?? "");

  if (state.error && state.error !== "loading" && !state.capabilities) {
    return (
      <ReaderErrorState
        code={state.error}
        message={state.errorMessage}
        onBack={() => navigate(bookPath(slug))}
      />
    );
  }

  return (
    <div className={styles.readerShell} onClick={toggleControls}>
      <ReaderChrome
        bookId={slug}
        bookTitle={state.bookTitle}
        showControls={state.showControls}
        capabilities={state.capabilities}
        activePanel={state.activePanel}
        toc={state.toc}
        bookmarks={state.bookmarks}
        annotations={state.annotations}
        isBookmarked={state.isCurrentLocationBookmarked}
        currentLocator={state.currentLocator}
        overlayPlayback={state.overlayState.playback}
        ttsEnabled={state.ttsEnabled}
        progressLabel={progressLabel}
        typography={state.typography}
        selectionVisible={!!state.selection}
        selectionClubActions={
          state.selection && (
            <ShareWithClub
              workId={state.bookId}
              locator={state.selection.locator}
              text={state.selection.text.highlight}
            />
          )
        }
        onToggleControls={toggleControls}
        onSetPanel={setPanel}
        onGoBack={() => navigate(bookPath(slug))}
        onGoTo={(locator) => void goTo(locator)}
        onGoPrevious={() => void goPrevious()}
        onGoNext={() => void goNext()}
        onAddBookmark={() => void addBookmark()}
        onRemoveBookmark={(id) => void removeBookmark(id)}
        onDeleteAnnotation={(id) => void deleteAnnotation(id)}
        onHighlight={() => void createAnnotation({ highlightOnly: true })}
        onAddNote={() => void createAnnotation({ note: "" })}
        onClearSelection={clearSelection}
        onTypographyChange={(update) => setTypography(update)}
        onPlayOverlay={() => void playOverlay()}
        onPauseOverlay={pauseOverlay}
        onOverlayNext={() => void overlayNextSegment()}
        onOverlayPrevious={() => void overlayPreviousSegment()}
        onToggleTts={toggleTts}
      />
      {state.loading && (
        <p className={styles.readerError} role="status">
          {t("readerLoading")}
        </p>
      )}
      <div ref={containerRef} className={styles.readerViewport} />
    </div>
  );
}

export function BookReaderPage() {
  const { t } = useTranslation("books");
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [book, setBook] = useState<BookDetail | null>(null);
  const repParam = searchParams.get("rep");

  useEffect(() => {
    if (!slug) return;
    void api<{ data: BookDetail }>(`/books/${slug}`).then((r) =>
      setBook(r.data),
    );
  }, [slug]);

  if (!book || !slug) return <p role="status">{t("readerLoading")}</p>;

  const epubReps = book.representations.filter((r) => r.format === "epub");

  if (epubReps.length === 0) {
    return (
      <div className={styles.readerShell}>
        <ReaderErrorState
          code="unsupported_format"
          onBack={() => window.history.back()}
        />
      </div>
    );
  }

  const needsPicker =
    !repParam &&
    !book.userState.progressRepresentationId &&
    epubReps.length > 1;

  if (needsPicker) {
    return (
      <div className={styles.readerShell}>
        <div className={styles.readerToolbar}>
          <NavBackLink to={bookPath(slug)}>{book.title}</NavBackLink>
        </div>
        <div className={styles.repPicker}>
          <h2>{t("selectRepresentation")}</h2>
          {epubReps.map((rep) => (
            <Button
              key={rep.id}
              type="button"
              onClick={() => {
                window.location.href = `${bookReaderPath(slug)}?rep=${rep.id}`;
              }}
            >
              EPUB · {rep.files.length} file(s)
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const initialRep =
    repParam ??
    (book.userState.progressRepresentationId &&
    epubReps.some((r) => r.id === book.userState.progressRepresentationId)
      ? book.userState.progressRepresentationId
      : epubReps[0]!.id);

  return (
    <ReaderSessionProvider
      bookSlug={slug}
      book={book}
      initialRepresentationId={initialRep}
      containerRef={containerRef}
    >
      <ReaderContent containerRef={containerRef} slug={slug} />
    </ReaderSessionProvider>
  );
}
