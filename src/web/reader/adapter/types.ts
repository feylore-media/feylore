import type { LocatorText, ReadingLocator } from "@shared/books";

export interface TypographyPreferences {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  theme?: "light" | "dark" | "sepia";
  margins?: number;
}

export interface PublicationCapabilities {
  hasToc: boolean;
  isReflowable: boolean;
  hasMediaOverlays: boolean;
  supportsBookmarks: boolean;
  supportsAnnotations: boolean;
}

export interface TocEntry {
  href: string;
  title: string;
  children?: TocEntry[];
}

export interface TextSelectionPayload {
  locator: ReadingLocator;
  text: LocatorText;
}

export type OverlayPlaybackState =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error";

export interface OverlayState {
  playback: OverlayPlaybackState;
  segmentLabel?: string;
  segmentProgress?: number;
  error?: string;
}

export interface ReaderAdapter {
  open(manifestUrl: string, initialLocator?: ReadingLocator): Promise<void>;
  destroy(): void;
  getLocator(): ReadingLocator | null;
  goTo(locator: ReadingLocator): Promise<void>;
  goNext(): Promise<boolean>;
  goPrevious(): Promise<boolean>;
  onLocatorChange(cb: (locator: ReadingLocator) => void): void;
  setTypography(prefs: TypographyPreferences): void;
  getCapabilities(): PublicationCapabilities;
  getToc(): TocEntry[];
  onTextSelected(cb: (selection: TextSelectionPayload) => void): void;
  onOverlayStateChange(cb: (state: OverlayState) => void): void;
  playOverlay(): Promise<void>;
  pauseOverlay(): void;
  stopOverlay(): void;
  overlayNextSegment(): Promise<void>;
  overlayPreviousSegment(): Promise<void>;
  toggleTts(enabled: boolean): void;
}
