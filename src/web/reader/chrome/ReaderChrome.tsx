import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ReadingLocator } from "@shared/books";
import type { TocEntry } from "../adapter/types";
import type { BookmarkItem, AnnotationItem } from "../session/types";
import { Button } from "../../components/primitives";
import { Icon } from "../../components/icons/Icon";
import { UiBackIcon } from "../../components/icons/ui-icons";
import { CloseIconButton } from "../../components/icons/UiIconButtons";
import styles from "../reader.module.css";

interface ReaderChromeProps {
  bookId: string;
  bookTitle: string;
  showControls: boolean;
  capabilities: {
    hasToc: boolean;
    hasMediaOverlays: boolean;
  } | null;
  activePanel: "toc" | "bookmarks" | "annotations" | "typography" | null;
  toc: TocEntry[];
  bookmarks: BookmarkItem[];
  annotations: AnnotationItem[];
  isBookmarked: boolean;
  currentLocator: ReadingLocator | null;
  overlayPlayback: string;
  ttsEnabled: boolean;
  progressLabel: string;
  typography: {
    fontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
    theme?: string;
    margins?: number;
  };
  selectionVisible: boolean;
  selectionClubActions?: ReactNode;
  onToggleControls: () => void;
  onSetPanel: (
    panel: "toc" | "bookmarks" | "annotations" | "typography" | null,
  ) => void;
  onGoBack: () => void;
  onGoTo: (locator: ReadingLocator) => void;
  onGoPrevious: () => void;
  onGoNext: () => void;
  onAddBookmark: () => void;
  onRemoveBookmark: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onHighlight: () => void;
  onAddNote: () => void;
  onClearSelection: () => void;
  onTypographyChange: (update: Record<string, unknown>) => void;
  onPlayOverlay: () => void;
  onPauseOverlay: () => void;
  onOverlayNext: () => void;
  onOverlayPrevious: () => void;
  onToggleTts: () => void;
}

function TocList({
  entries,
  onGoTo,
  depth = 0,
}: {
  entries: TocEntry[];
  onGoTo: (locator: ReadingLocator) => void;
  depth?: number;
}) {
  return (
    <ul
      className={styles.panelList}
      style={{ paddingLeft: depth ? "1rem" : 0 }}
    >
      {entries.map((entry) => (
        <li key={entry.href + entry.title}>
          <button
            type="button"
            className={styles.panelListButton}
            onClick={() =>
              onGoTo({ type: "epub-cfi", href: entry.href, title: entry.title })
            }
          >
            {entry.title}
          </button>
          {entry.children && entry.children.length > 0 && (
            <TocList
              entries={entry.children}
              onGoTo={onGoTo}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReaderChrome(props: ReaderChromeProps) {
  const { t } = useTranslation("books");
  const panelRef = useRef<HTMLDivElement>(null);
  const { activePanel, onSetPanel, isBookmarked, bookmarks, currentLocator } =
    props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && activePanel) {
        onSetPanel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePanel, onSetPanel]);

  const bookmarkAtLocation = isBookmarked
    ? bookmarks.find(
        (bm) =>
          (currentLocator?.cfi && bm.locator.cfi === currentLocator.cfi) ||
          (currentLocator?.href &&
            bm.locator.href === currentLocator.href &&
            bm.locator.progression === currentLocator.progression),
      )
    : undefined;

  return (
    <>
      {props.showControls && (
        <div
          className={styles.readerToolbar}
          role="toolbar"
          aria-label={t("readerToolbar")}
        >
          <Button type="button" onClick={props.onGoBack}>
            <Icon icon={UiBackIcon} size="sm" aria-hidden />
            {t("cancel")}
          </Button>
          <span className={styles.readerTitle}>{props.bookTitle}</span>
          <span
            className={styles.readerProgress}
            role="status"
            aria-live="polite"
          >
            {props.progressLabel}
          </span>
          <div className={styles.readerControls}>
            <Button
              type="button"
              onClick={props.onGoPrevious}
              aria-label={t("previousPage")}
            >
              ‹
            </Button>
            <Button
              type="button"
              onClick={props.onGoNext}
              aria-label={t("nextPage")}
            >
              ›
            </Button>
            {props.capabilities?.hasToc && (
              <Button
                type="button"
                aria-pressed={props.activePanel === "toc"}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onSetPanel(props.activePanel === "toc" ? null : "toc");
                }}
              >
                {t("toc")}
              </Button>
            )}
            <Button
              type="button"
              aria-pressed={props.activePanel === "typography"}
              onClick={(e) => {
                e.stopPropagation();
                props.onSetPanel(
                  props.activePanel === "typography" ? null : "typography",
                );
              }}
            >
              {t("readerSettings")}
            </Button>
            <Button
              type="button"
              aria-pressed={props.isBookmarked}
              onClick={(e) => {
                e.stopPropagation();
                if (props.isBookmarked && bookmarkAtLocation) {
                  props.onRemoveBookmark(bookmarkAtLocation.id);
                } else {
                  props.onAddBookmark();
                }
              }}
            >
              {props.isBookmarked ? t("bookmarked") : t("bookmark")}
            </Button>
            <Button
              type="button"
              aria-pressed={props.activePanel === "bookmarks"}
              onClick={(e) => {
                e.stopPropagation();
                props.onSetPanel(
                  props.activePanel === "bookmarks" ? null : "bookmarks",
                );
              }}
            >
              {t("bookmarks")}
            </Button>
            <Button
              type="button"
              aria-pressed={props.activePanel === "annotations"}
              onClick={(e) => {
                e.stopPropagation();
                props.onSetPanel(
                  props.activePanel === "annotations" ? null : "annotations",
                );
              }}
            >
              {t("annotations")}
            </Button>
            {props.capabilities?.hasMediaOverlays ? (
              <>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (props.overlayPlayback === "playing") {
                      props.onPauseOverlay();
                    } else {
                      props.onPlayOverlay();
                    }
                  }}
                >
                  {props.overlayPlayback === "playing"
                    ? t("pauseReadAlong")
                    : t("playReadAlong")}
                </Button>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onOverlayPrevious();
                  }}
                  aria-label={t("previousSegment")}
                >
                  ⏮
                </Button>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onOverlayNext();
                  }}
                  aria-label={t("nextSegment")}
                >
                  ⏭
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggleTts();
                }}
              >
                {props.ttsEnabled ? t("stopReadAloud") : t("readAloud")}
              </Button>
            )}
          </div>
        </div>
      )}

      {props.activePanel && (
        <div
          ref={panelRef}
          className={styles.readerPanel}
          role="dialog"
          aria-label={props.activePanel}
        >
          <div className={styles.readerPanelHeader}>
            <h2>{props.activePanel}</h2>
            <Button type="button" onClick={() => props.onSetPanel(null)}>
              {t("close")}
            </Button>
          </div>
          <div className={styles.readerPanelBody}>
            {props.activePanel === "toc" &&
              (props.toc.length > 0 ? (
                <TocList
                  entries={props.toc}
                  onGoTo={(locator) => {
                    props.onGoTo(locator);
                    props.onSetPanel(null);
                  }}
                />
              ) : (
                <p>{t("noToc")}</p>
              ))}
            {props.activePanel === "bookmarks" &&
              (props.bookmarks.length > 0 ? (
                <ul className={styles.panelList}>
                  {props.bookmarks.map((bm) => (
                    <li key={bm.id} className={styles.panelListRow}>
                      <button
                        type="button"
                        className={styles.panelListButton}
                        onClick={() => {
                          props.onGoTo(bm.locator);
                          props.onSetPanel(null);
                        }}
                      >
                        {bm.label ?? bm.locator.title ?? t("bookmark")}
                      </button>
                      <CloseIconButton
                        aria-label={t("deleteBookmark")}
                        onClick={() => props.onRemoveBookmark(bm.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("noBookmarks")}</p>
              ))}
            {props.activePanel === "annotations" &&
              (props.annotations.length > 0 ? (
                <ul className={styles.panelList}>
                  {props.annotations.map((ann) => (
                    <li key={ann.id} className={styles.panelListRow}>
                      <button
                        type="button"
                        className={styles.panelListButton}
                        onClick={() => {
                          props.onGoTo(ann.locator);
                          props.onSetPanel(null);
                        }}
                      >
                        {ann.highlightText ?? ann.note ?? t("annotation")}
                      </button>
                      <CloseIconButton
                        aria-label={t("deleteAnnotation")}
                        onClick={() => props.onDeleteAnnotation(ann.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("noAnnotations")}</p>
              ))}
            {props.activePanel === "typography" && (
              <div className={styles.typographyPanel}>
                <label htmlFor="readerFontFamily">{t("fontFamily")}</label>
                <input
                  id="readerFontFamily"
                  value={props.typography.fontFamily ?? "Georgia, serif"}
                  onChange={(e) =>
                    props.onTypographyChange({ fontFamily: e.target.value })
                  }
                />
                <label htmlFor="readerFontSize">
                  {t("fontSize")}: {props.typography.fontSize ?? 100}%
                </label>
                <input
                  id="readerFontSize"
                  type="range"
                  min={80}
                  max={200}
                  value={props.typography.fontSize ?? 100}
                  onChange={(e) =>
                    props.onTypographyChange({
                      fontSize: Number(e.target.value),
                    })
                  }
                />
                <label htmlFor="readerTheme">{t("theme")}</label>
                <select
                  id="readerTheme"
                  value={props.typography.theme ?? "light"}
                  onChange={(e) =>
                    props.onTypographyChange({ theme: e.target.value })
                  }
                >
                  <option value="light">{t("themeLight")}</option>
                  <option value="dark">{t("themeDark")}</option>
                  <option value="sepia">{t("themeSepia")}</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {props.selectionVisible && (
        <div
          className={styles.selectionToolbar}
          role="toolbar"
          aria-label={t("selectionActions")}
        >
          <Button type="button" onClick={props.onHighlight}>
            {t("highlight")}
          </Button>
          <Button type="button" onClick={props.onAddNote}>
            {t("addNote")}
          </Button>
          {props.selectionClubActions}
          <Button type="button" onClick={props.onClearSelection}>
            {t("cancel")}
          </Button>
        </div>
      )}
    </>
  );
}

export function ReaderErrorState({
  code,
  message,
  onBack,
}: {
  code: string;
  message?: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation("books");
  const labels: Record<string, string> = {
    loading: t("readerLoading"),
    publication_unavailable: t("readerUnavailable"),
    unsupported_format: t("readerUnsupportedFormat"),
    malformed_epub: t("readerMalformedEpub"),
    resource_failure: t("readerResourceFailure"),
    preferences_failure: t("readerPreferencesFailure"),
    bookmarks_failure: t("readerBookmarksFailure"),
    annotations_failure: t("readerAnnotationsFailure"),
    overlay_failure: t("readerOverlayFailure"),
    offline_unavailable: t("readerOfflineUnavailable"),
  };
  return (
    <div className={styles.readerError}>
      <p role="alert">{message ?? labels[code] ?? t("readerUnavailable")}</p>
      <Button type="button" onClick={onBack}>
        {t("cancel")}
      </Button>
    </div>
  );
}
