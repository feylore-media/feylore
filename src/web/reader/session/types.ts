import type {
  ReadingLocator,
  LocatorText,
} from "@shared/books";
import type {
  PublicationCapabilities,
  TocEntry,
  OverlayState,
  TypographyPreferences,
} from "../adapter/types";

export type ReaderErrorCode =
  | "loading"
  | "publication_unavailable"
  | "unsupported_format"
  | "malformed_epub"
  | "resource_failure"
  | "preferences_failure"
  | "bookmarks_failure"
  | "annotations_failure"
  | "overlay_failure"
  | "offline_unavailable";

export interface BookmarkItem {
  id: string;
  label: string | null;
  locator: ReadingLocator;
  representationId: string | null;
  createdAt: string;
}

export interface AnnotationItem {
  id: string;
  locator: ReadingLocator;
  highlightText: string | null;
  note: string | null;
  color: string | null;
  representationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReaderPanel = "toc" | "bookmarks" | "annotations" | "typography" | null;

export interface TextSelectionState {
  locator: ReadingLocator;
  text: LocatorText;
}

export interface ReaderSessionState {
  bookId: string;
  bookTitle: string;
  representationId: string | null;
  currentLocator: ReadingLocator | null;
  capabilities: PublicationCapabilities | null;
  toc: TocEntry[];
  bookmarks: BookmarkItem[];
  annotations: AnnotationItem[];
  typography: TypographyPreferences;
  progressSyncEnabled: boolean;
  overlayState: OverlayState;
  ttsEnabled: boolean;
  selection: TextSelectionState | null;
  activePanel: ReaderPanel;
  showControls: boolean;
  error: ReaderErrorCode | null;
  errorMessage: string | null;
  loading: boolean;
  isCurrentLocationBookmarked: boolean;
}

export type ReaderSessionAction =
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: ReaderErrorCode | null; message?: string | null }
  | { type: "SET_REPRESENTATION"; representationId: string }
  | { type: "SET_LOCATOR"; locator: ReadingLocator | null }
  | { type: "SET_CAPABILITIES"; capabilities: PublicationCapabilities; toc: TocEntry[] }
  | { type: "SET_BOOKMARKS"; bookmarks: BookmarkItem[] }
  | { type: "SET_ANNOTATIONS"; annotations: AnnotationItem[] }
  | { type: "SET_TYPOGRAPHY"; typography: TypographyPreferences }
  | { type: "SET_PROGRESS_SYNC"; enabled: boolean }
  | { type: "SET_OVERLAY_STATE"; state: OverlayState }
  | { type: "SET_TTS"; enabled: boolean }
  | { type: "SET_SELECTION"; selection: TextSelectionState | null }
  | { type: "SET_PANEL"; panel: ReaderPanel }
  | { type: "SET_SHOW_CONTROLS"; show: boolean }
  | { type: "UPDATE_BOOKMARK_FLAG" };

export function readerSessionReducer(
  state: ReaderSessionState,
  action: ReaderSessionAction,
): ReaderSessionState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.loading, error: action.loading ? null : state.error };
    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        errorMessage: action.message ?? null,
        loading: false,
      };
    case "SET_REPRESENTATION":
      return { ...state, representationId: action.representationId };
    case "SET_LOCATOR":
      return {
        ...state,
        currentLocator: action.locator,
        isCurrentLocationBookmarked: bookmarkMatches(
          state.bookmarks,
          action.locator,
        ),
      };
    case "SET_CAPABILITIES":
      return {
        ...state,
        capabilities: action.capabilities,
        toc: action.toc,
        loading: false,
        error: null,
      };
    case "SET_BOOKMARKS":
      return {
        ...state,
        bookmarks: action.bookmarks,
        isCurrentLocationBookmarked: bookmarkMatches(
          action.bookmarks,
          state.currentLocator,
        ),
      };
    case "SET_ANNOTATIONS":
      return { ...state, annotations: action.annotations };
    case "SET_TYPOGRAPHY":
      return { ...state, typography: action.typography };
    case "SET_PROGRESS_SYNC":
      return { ...state, progressSyncEnabled: action.enabled };
    case "SET_OVERLAY_STATE":
      return { ...state, overlayState: action.state };
    case "SET_TTS":
      return { ...state, ttsEnabled: action.enabled };
    case "SET_SELECTION":
      return { ...state, selection: action.selection };
    case "SET_PANEL":
      return { ...state, activePanel: action.panel };
    case "SET_SHOW_CONTROLS":
      return { ...state, showControls: action.show };
    case "UPDATE_BOOKMARK_FLAG":
      return {
        ...state,
        isCurrentLocationBookmarked: bookmarkMatches(
          state.bookmarks,
          state.currentLocator,
        ),
      };
    default:
      return state;
  }
}

function bookmarkMatches(
  bookmarks: BookmarkItem[],
  locator: ReadingLocator | null,
): boolean {
  if (!locator?.cfi && !locator?.href) return false;
  return bookmarks.some(
    (b) =>
      (locator.cfi && b.locator.cfi === locator.cfi) ||
      (locator.href && b.locator.href === locator.href &&
        b.locator.progression === locator.progression),
  );
}

export function createInitialReaderState(
  bookId: string,
  bookTitle: string,
  typography: TypographyPreferences,
  progressSyncEnabled: boolean,
): ReaderSessionState {
  return {
    bookId,
    bookTitle,
    representationId: null,
    currentLocator: null,
    capabilities: null,
    toc: [],
    bookmarks: [],
    annotations: [],
    typography,
    progressSyncEnabled,
    overlayState: { playback: "idle" },
    ttsEnabled: false,
    selection: null,
    activePanel: null,
    showControls: true,
    error: "loading",
    errorMessage: null,
    loading: true,
    isCurrentLocationBookmarked: false,
  };
}
