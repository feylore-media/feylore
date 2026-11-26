import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { BookDetail, ReadingLocator } from "@shared/books";
import type { ReaderSettings } from "@shared/settings";
import { api } from "../../app/api";
import { createEpubReader } from "../adapter/EpubReadiumAdapter";
import { useReaderPresence } from "../../presence/useReaderPresence";
import {
  isManifestCached,
  OfflineUnavailableError,
} from "../../downloads/cachedFetch";
import type { ReaderAdapter } from "../adapter/types";
import {
  loadTypographyPreferences,
  saveTypographyPreferences,
} from "../preferences/readerPreferences";
import {
  createInitialReaderState,
  readerSessionReducer,
  type AnnotationItem,
  type BookmarkItem,
  type ReaderPanel,
  type ReaderSessionState,
} from "./types";

interface ReaderSessionContextValue {
  state: ReaderSessionState;
  goTo: (locator: ReadingLocator) => Promise<void>;
  goNext: () => Promise<void>;
  goPrevious: () => Promise<void>;
  setPanel: (panel: ReaderPanel) => void;
  toggleControls: () => void;
  setTypography: (update: Partial<ReaderSessionState["typography"]>) => void;
  addBookmark: (label?: string) => Promise<void>;
  removeBookmark: (bookmarkId: string) => Promise<void>;
  refreshBookmarks: () => Promise<void>;
  createAnnotation: (input: {
    note?: string;
    color?: string;
    highlightOnly?: boolean;
  }) => Promise<void>;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  refreshAnnotations: () => Promise<void>;
  playOverlay: () => Promise<void>;
  pauseOverlay: () => void;
  stopOverlay: () => void;
  overlayNextSegment: () => Promise<void>;
  overlayPreviousSegment: () => Promise<void>;
  toggleTts: () => void;
  clearSelection: () => void;
  selectRepresentation: (representationId: string) => void;
}

const ReaderSessionContext = createContext<ReaderSessionContextValue | null>(
  null,
);

export function useReaderSession(): ReaderSessionContextValue {
  const ctx = useContext(ReaderSessionContext);
  if (!ctx) throw new Error("useReaderSession requires ReaderSessionProvider");
  return ctx;
}

interface ReaderSessionProviderProps {
  bookSlug: string;
  book: BookDetail | null;
  initialRepresentationId: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

export function ReaderSessionProvider({
  bookSlug,
  book,
  initialRepresentationId,
  containerRef,
  children,
}: ReaderSessionProviderProps) {
  const adapterRef = useRef<ReaderAdapter | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const openedRepRef = useRef<string | null>(null);
  const clientIdRef = useRef(`feylore-web-${crypto.randomUUID()}`);
  const sessionIdRef = useRef<string | null>(null);
  const lastActivityAtRef = useRef<number>(Date.now());

  const [state, dispatch] = useReducer(
    readerSessionReducer,
    createInitialReaderState(
      book?.id ?? bookSlug,
      book?.title ?? "",
      loadTypographyPreferences(),
      true,
    ),
  );

  const representationId =
    state.representationId ?? initialRepresentationId;

  const presenceProgressPercent = (() => {
    const loc = state.currentLocator as unknown as
      | { totalProgression?: unknown; progression?: unknown }
      | null;
    const raw = loc?.totalProgression ?? loc?.progression;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
      return null;
    }
    return Math.round(raw * 100);
  })();

  const { touch: touchPresence } = useReaderPresence({
    workType: "book",
    workId: book?.id ?? bookSlug,
    representationId,
    progressPercent: presenceProgressPercent,
  });

  const resolveRepresentationId = useCallback((): string | null => {
    if (initialRepresentationId) return initialRepresentationId;
    if (book?.userState.progressRepresentationId) {
      const saved = book.userState.progressRepresentationId;
      if (book.representations.some((r) => r.id === saved && r.format === "epub")) {
        return saved;
      }
    }
    const epub = book?.representations.find((r) => r.format === "epub");
    return epub?.id ?? null;
  }, [book, initialRepresentationId]);

  useEffect(() => {
    if (!book) return;
    const repId = resolveRepresentationId();
    if (repId && !state.representationId) {
      dispatch({ type: "SET_REPRESENTATION", representationId: repId });
    }
  }, [book, resolveRepresentationId, state.representationId]);

  useEffect(() => {
    void api<{ data: ReaderSettings }>("/settings/reader")
      .then((r) =>
        dispatch({ type: "SET_PROGRESS_SYNC", enabled: r.data.progressSyncEnabled }),
      )
      .catch(() =>
        dispatch({ type: "SET_ERROR", error: "preferences_failure" }),
      );
  }, []);

  const refreshBookmarks = useCallback(async () => {
    try {
      const r = await api<{ data: BookmarkItem[] }>(`/books/${bookSlug}/bookmarks`);
      dispatch({ type: "SET_BOOKMARKS", bookmarks: r.data });
    } catch {
      dispatch({ type: "SET_ERROR", error: "bookmarks_failure" });
    }
  }, [bookSlug]);

  const refreshAnnotations = useCallback(async () => {
    try {
      const r = await api<{ data: AnnotationItem[] }>(
        `/books/${bookSlug}/annotations`,
      );
      dispatch({ type: "SET_ANNOTATIONS", annotations: r.data });
    } catch {
      dispatch({ type: "SET_ERROR", error: "annotations_failure" });
    }
  }, [bookSlug]);

  useEffect(() => {
    if (!bookSlug) return;
    void refreshBookmarks();
    void refreshAnnotations();
  }, [bookSlug, refreshBookmarks, refreshAnnotations]);

  const saveProgress = useCallback(
    (locator: ReadingLocator) => {
      const raw = (locator as unknown as Record<string, unknown>).totalProgression ??
        (locator as unknown as Record<string, unknown>).progression;
      const progressPercent =
        typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1
          ? Math.round(raw * 100)
          : null;
      void touchPresence({ progressPercent });
      if (!state.progressSyncEnabled) return;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => {
        void api(`/books/${bookSlug}/progress`, {
          method: "PUT",
          body: JSON.stringify({
            locator,
            representationId: representationId ?? undefined,
          }),
        });
      }, 1500);
    },
    [bookSlug, representationId, state.progressSyncEnabled, touchPresence],
  );

  const recordActivity = useCallback(
    async (
      locator: ReadingLocator,
      duration: number,
      visibility: "active" | "hidden" | "background",
    ) => {
      if (!state.progressSyncEnabled || !representationId) return;
      try {
        const r = await api<{
          data: { sessionId: string };
        }>(`/representations/${representationId}/reading-activity`, {
          method: "POST",
          body: JSON.stringify({
            locator,
            duration,
            visibility,
            clientId: clientIdRef.current,
            idempotencyKey: `${clientIdRef.current}-${Date.now()}`,
          }),
        });
        sessionIdRef.current = r.data.sessionId;
      } catch {
        // Activity reporting is best-effort
      }
    },
    [representationId, state.progressSyncEnabled],
  );

  const flushActivity = useCallback(
    (locator: ReadingLocator | null, finalize = false) => {
      if (!locator || !state.progressSyncEnabled) return;
      const now = Date.now();
      const elapsed = Math.max(
        0,
        Math.floor((now - lastActivityAtRef.current) / 1000),
      );
      lastActivityAtRef.current = now;
      const visibility =
        document.visibilityState === "visible" ? "active" : "hidden";
      void recordActivity(locator, elapsed, visibility);
      if (finalize && sessionIdRef.current) {
        void api(`/reading-sessions/${sessionIdRef.current}`, {
          method: "PATCH",
          body: JSON.stringify({ ended: true, endingLocator: locator }),
        });
        sessionIdRef.current = null;
      }
    },
    [recordActivity, state.progressSyncEnabled],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!representationId || !container || !book) return;
    if (openedRepRef.current === representationId && adapterRef.current) return;

    const rep = book.representations.find((r) => r.id === representationId);
    if (!rep || rep.format !== "epub") {
      dispatch({
        type: "SET_ERROR",
        error: rep ? "unsupported_format" : "publication_unavailable",
      });
      return;
    }

    if (adapterRef.current) {
      adapterRef.current.destroy();
      adapterRef.current = null;
    }

    dispatch({ type: "SET_LOADING", loading: true });
    dispatch({ type: "SET_REPRESENTATION", representationId });

    const adapter = createEpubReader(container);
    adapterRef.current = adapter;
    openedRepRef.current = representationId;

    adapter.setTypography(loadTypographyPreferences());
    adapter.onLocatorChange((loc) => {
      dispatch({ type: "SET_LOCATOR", locator: loc });
      saveProgress(loc);
    });
    adapter.onTextSelected(({ locator, text }) => {
      dispatch({
        type: "SET_SELECTION",
        selection: { locator: { ...locator, locatorText: text }, text },
      });
    });
    adapter.onOverlayStateChange((overlayState) => {
      dispatch({ type: "SET_OVERLAY_STATE", state: overlayState });
    });

    const manifestUrl = `/api/v1/representations/${representationId}/publication/manifest`;
    const initial =
      book.userState.progressRepresentationId === representationId
        ? (book.userState.progress ?? undefined)
        : undefined;

    void (async () => {
      if (!navigator.onLine) {
        const cached = await isManifestCached(manifestUrl);
        if (!cached) {
          dispatch({ type: "SET_LOADING", loading: false });
          dispatch({ type: "SET_ERROR", error: "offline_unavailable" });
          return;
        }
      }

      try {
        await adapter.open(manifestUrl, initial);
        dispatch({
          type: "SET_CAPABILITIES",
          capabilities: adapter.getCapabilities(),
          toc: adapter.getToc(),
        });
      } catch (err) {
        if (err instanceof OfflineUnavailableError) {
          dispatch({ type: "SET_ERROR", error: "offline_unavailable" });
        } else {
          dispatch({ type: "SET_ERROR", error: "malformed_epub" });
        }
      }
    })();

    lastActivityAtRef.current = Date.now();

    activityTimer.current = setInterval(() => {
      const locator = adapterRef.current?.getLocator();
      if (locator) flushActivity(locator);
    }, 30_000);

    const onVisibility = () => {
      const locator = adapterRef.current?.getLocator();
      if (locator) flushActivity(locator);
    };
    const onPageHide = () => {
      const locator = adapterRef.current?.getLocator() ?? null;
      flushActivity(locator, true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      const locator = adapter.getLocator() ?? null;
      flushActivity(locator, true);
      if (activityTimer.current) clearInterval(activityTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      adapter.destroy();
      adapterRef.current = null;
      openedRepRef.current = null;
    };
  }, [representationId, book, bookSlug, containerRef, saveProgress, flushActivity]);

  const goTo = useCallback(async (locator: ReadingLocator) => {
    adapterRef.current?.stopOverlay();
    await adapterRef.current?.goTo(locator);
    void touchPresence();
  }, [touchPresence]);

  const goNext = useCallback(async () => {
    adapterRef.current?.stopOverlay();
    await adapterRef.current?.goNext();
    void touchPresence();
  }, [touchPresence]);

  const goPrevious = useCallback(async () => {
    adapterRef.current?.stopOverlay();
    await adapterRef.current?.goPrevious();
    void touchPresence();
  }, [touchPresence]);

  const setPanel = useCallback((panel: ReaderPanel) => {
    dispatch({ type: "SET_PANEL", panel });
  }, []);

  const toggleControls = useCallback(() => {
    dispatch({ type: "SET_SHOW_CONTROLS", show: !state.showControls });
  }, [state.showControls]);

  const setTypography = useCallback(
    (update: Partial<ReaderSessionState["typography"]>) => {
      const next = { ...state.typography, ...update };
      dispatch({ type: "SET_TYPOGRAPHY", typography: next });
      saveTypographyPreferences(next);
      adapterRef.current?.setTypography(next);
    },
    [state.typography],
  );

  const addBookmark = useCallback(async () => {
    const locator = adapterRef.current?.getLocator();
    if (!locator || !representationId) return;
    await api(`/books/${bookSlug}/bookmarks`, {
      method: "POST",
      body: JSON.stringify({ locator, representationId }),
    });
    void touchPresence();
    await refreshBookmarks();
  }, [bookSlug, representationId, refreshBookmarks, touchPresence]);

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      await api(`/books/${bookSlug}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
      await refreshBookmarks();
    },
    [bookSlug, refreshBookmarks],
  );

  const createAnnotation = useCallback(
    async (input: { note?: string; color?: string; highlightOnly?: boolean }) => {
      const sel = state.selection;
      if (!sel || !representationId) return;
      await api(`/books/${bookSlug}/annotations`, {
        method: "POST",
        body: JSON.stringify({
          locator: sel.locator,
          highlightText: sel.text.highlight,
          note: input.highlightOnly ? undefined : input.note,
          color: input.color,
          representationId,
        }),
      });
      dispatch({ type: "SET_SELECTION", selection: null });
      void touchPresence();
      await refreshAnnotations();
    },
    [bookSlug, representationId, state.selection, refreshAnnotations, touchPresence],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      await api(`/books/${bookSlug}/annotations/${annotationId}`, {
        method: "DELETE",
      });
      await refreshAnnotations();
    },
    [bookSlug, refreshAnnotations],
  );

  const playOverlay = useCallback(async () => {
    try {
      await adapterRef.current?.playOverlay();
    } catch {
      dispatch({ type: "SET_ERROR", error: "overlay_failure" });
    }
  }, []);

  const pauseOverlay = useCallback(() => {
    adapterRef.current?.pauseOverlay();
  }, []);

  const stopOverlay = useCallback(() => {
    adapterRef.current?.stopOverlay();
  }, []);

  const overlayNextSegment = useCallback(async () => {
    await adapterRef.current?.overlayNextSegment();
  }, []);

  const overlayPreviousSegment = useCallback(async () => {
    await adapterRef.current?.overlayPreviousSegment();
  }, []);

  const toggleTts = useCallback(() => {
    if (state.capabilities?.hasMediaOverlays) return;
    const next = !state.ttsEnabled;
    dispatch({ type: "SET_TTS", enabled: next });
    adapterRef.current?.toggleTts(next);
  }, [state.ttsEnabled, state.capabilities?.hasMediaOverlays]);

  const clearSelection = useCallback(() => {
    dispatch({ type: "SET_SELECTION", selection: null });
  }, []);

  const selectRepresentation = useCallback((repId: string) => {
    openedRepRef.current = null;
    dispatch({ type: "SET_REPRESENTATION", representationId: repId });
  }, []);

  const value = useMemo(
    () => ({
      state: { ...state, bookTitle: book?.title ?? state.bookTitle },
      goTo,
      goNext,
      goPrevious,
      setPanel,
      toggleControls,
      setTypography,
      addBookmark,
      removeBookmark,
      refreshBookmarks,
      createAnnotation,
      deleteAnnotation,
      refreshAnnotations,
      playOverlay,
      pauseOverlay,
      stopOverlay,
      overlayNextSegment,
      overlayPreviousSegment,
      toggleTts,
      clearSelection,
      selectRepresentation,
    }),
    [
      state,
      book?.title,
      goTo,
      goNext,
      goPrevious,
      setPanel,
      toggleControls,
      setTypography,
      addBookmark,
      removeBookmark,
      refreshBookmarks,
      createAnnotation,
      deleteAnnotation,
      refreshAnnotations,
      playOverlay,
      pauseOverlay,
      stopOverlay,
      overlayNextSegment,
      overlayPreviousSegment,
      toggleTts,
      clearSelection,
      selectRepresentation,
    ],
  );

  return (
    <ReaderSessionContext.Provider value={value}>
      {children}
    </ReaderSessionContext.Provider>
  );
}
