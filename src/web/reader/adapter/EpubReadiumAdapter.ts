import {
  EpubNavigator,
  EpubPreferences,
} from "@readium/navigator";
import {
  HttpFetcher,
  Manifest,
  Publication,
  Locator,
  LocatorLocations,
  LocatorText,
  Link,
} from "@readium/shared";
import type { ReadingLocator, LocatorText as FeyLocatorText } from "@shared/books";
import type {
  ReaderAdapter,
  TypographyPreferences,
  PublicationCapabilities,
  TocEntry,
  TextSelectionPayload,
  OverlayState,
} from "./types.js";
import { MediaOverlayController } from "./mediaOverlay.js";
import { cachedFetch } from "../../downloads/cachedFetch.js";

function locatorToReadium(loc: ReadingLocator): Locator | undefined {
  if (!loc.cfi && !loc.href) return undefined;
  const text = loc.locatorText
    ? new LocatorText({
        before: loc.locatorText.before,
        highlight: loc.locatorText.highlight ?? loc.title,
        after: loc.locatorText.after,
      })
    : loc.title
      ? new LocatorText({ highlight: loc.title })
      : undefined;
  return new Locator({
    href: loc.href ?? "",
    type: "application/xhtml+xml",
    locations: new LocatorLocations({
      fragments: loc.cfi ? [loc.cfi] : [],
      progression: loc.progression,
      totalProgression: loc.totalProgression,
    }),
    text,
  });
}

function readiumToLocator(loc: Locator): ReadingLocator {
  const cfi = loc.locations.fragments?.[0];
  const locatorText: FeyLocatorText | undefined = loc.text
    ? {
        before: loc.text.before,
        highlight: loc.text.highlight,
        after: loc.text.after,
      }
    : undefined;
  return {
    type: "epub-cfi",
    cfi,
    href: loc.href,
    progression: loc.locations.progression ?? undefined,
    totalProgression: loc.locations.totalProgression ?? undefined,
    title: loc.title ?? loc.text?.highlight,
    locatorText,
  };
}

function linksToToc(links: Link[]): TocEntry[] {
  return links.map((link) => ({
    href: stripResourceQuery(link.href),
    title: link.title ?? link.href,
    children:
      link.children && link.children.items.length > 0
        ? linksToToc(link.children.items)
        : undefined,
  }));
}

function stripResourceQuery(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    return url.searchParams.get("path") ?? href;
  } catch {
    const match = href.match(/[?&]path=([^&]+)/);
    return match ? decodeURIComponent(match[1]!) : href;
  }
}

function linkHasRel(link: Link, rel: string): boolean {
  return link.rels?.has(rel) ?? false;
}

function linksHasRel(links: Link[] | undefined, rel: string): boolean {
  return links?.some((l) => linkHasRel(l, rel)) ?? false;
}

function deriveCapabilities(publication: Publication): PublicationCapabilities {
  const meta = publication.metadata as { layout?: string; mediaOverlay?: unknown };
  const hasToc = (publication.toc?.items.length ?? 0) > 0;
  const isReflowable = meta.layout !== "fixed";
  const hasMediaOverlays =
    !!meta.mediaOverlay ||
    publication.readingOrder.items.some((link) =>
      linksHasRel(link.alternates?.items, "media-overlay"),
    );
  return {
    hasToc,
    isReflowable,
    hasMediaOverlays,
    supportsBookmarks: true,
    supportsAnnotations: true,
  };
}

export class EpubReadiumAdapter implements ReaderAdapter {
  private navigator: EpubNavigator | null = null;
  private publication: Publication | null = null;
  private manifestUrl = "";
  private locatorCb: ((loc: ReadingLocator) => void) | null = null;
  private textSelectedCb: ((selection: TextSelectionPayload) => void) | null =
    null;
  private overlayStateCb: ((state: OverlayState) => void) | null = null;
  private currentLocator: ReadingLocator | null = null;
  private capabilities: PublicationCapabilities = {
    hasToc: false,
    isReflowable: true,
    hasMediaOverlays: false,
    supportsBookmarks: true,
    supportsAnnotations: true,
  };
  private ttsUtterance: SpeechSynthesisUtterance | null = null;
  private overlay = new MediaOverlayController();
  private overlayResourceBase = "";

  constructor(private readonly container: HTMLElement) {
    this.overlay.setStateCallback((state) => this.overlayStateCb?.(state));
    this.overlay.setSegmentChangeCallback((seg) => {
      void this.goTo({
        type: "epub-cfi",
        href: seg.textHref,
        title: seg.label,
        ...(seg.textFragment ? {} : {}),
      });
    });
  }

  async open(manifestUrl: string, initialLocator?: ReadingLocator) {
    this.manifestUrl = manifestUrl;
    const res = await cachedFetch(manifestUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`Manifest failed: ${res.status}`);
    const json = await res.json();
    const manifest = Manifest.deserialize(json.data ?? json);
    if (!manifest) throw new Error("Invalid publication manifest");

    const fetcher = new HttpFetcher(
      (input, init) =>
        cachedFetch(input, { ...init, credentials: "include" }),
      window.location.origin,
    );
    this.publication = new Publication({ manifest, fetcher });
    this.capabilities = deriveCapabilities(this.publication);

    const match = manifestUrl.match(
      /\/representations\/([^/]+)\/publication\/manifest/,
    );
    if (match) {
      this.overlayResourceBase = `/api/v1/representations/${match[1]}/publication/resource`;
    }

    const positions: Locator[] = [];
    const initial = initialLocator
      ? locatorToReadium(initialLocator)
      : undefined;

    this.navigator = new EpubNavigator(
      this.container,
      this.publication,
      {
        positionChanged: (loc) => {
          this.currentLocator = readiumToLocator(loc);
          this.locatorCb?.(this.currentLocator);
        },
        frameLoaded: () => {},
        timelineItemChanged: () => {},
        tap: () => false,
        click: () => false,
        zoom: () => {},
        miscPointer: () => {},
        scroll: () => {},
        customEvent: () => {},
        handleLocator: () => false,
        textSelected: (selection) => {
          if (!selection?.locator || !this.textSelectedCb) return;
          const locator = readiumToLocator(selection.locator);
          const text: FeyLocatorText = {
            before: selection.locator.text?.before,
            highlight: selection.locator.text?.highlight ?? selection.text,
            after: selection.locator.text?.after,
          };
          this.textSelectedCb({ locator, text });
        },
        contentProtection: () => {},
        contextMenu: () => {},
        peripheral: () => {},
      },
      positions,
      initial,
      {
        preferences: {},
        defaults: {},
      },
    );

    await this.navigator.load();
  }

  destroy() {
    window.speechSynthesis.cancel();
    this.overlay.destroy();
    void this.navigator?.destroy();
    this.navigator = null;
    this.publication = null;
    this.container.innerHTML = "";
  }

  getLocator() {
    return this.currentLocator;
  }

  async goTo(locator: ReadingLocator) {
    const readiumLoc = locatorToReadium(locator);
    if (readiumLoc && this.navigator) {
      await new Promise<void>((resolve) => {
        this.navigator!.go(readiumLoc, true, () => resolve());
      });
    }
  }

  async goNext(): Promise<boolean> {
    if (!this.navigator) return false;
    return new Promise<boolean>((resolve) => {
      this.navigator!.goForward(true, (ok) => resolve(ok));
    });
  }

  async goPrevious(): Promise<boolean> {
    if (!this.navigator) return false;
    return new Promise<boolean>((resolve) => {
      this.navigator!.goBackward(true, (ok) => resolve(ok));
    });
  }

  onLocatorChange(cb: (locator: ReadingLocator) => void) {
    this.locatorCb = cb;
  }

  setTypography(prefs: TypographyPreferences) {
    if (!this.navigator) return;
    const epubPrefs = new EpubPreferences({
      fontFamily: prefs.fontFamily,
      fontSize: prefs.fontSize,
      lineHeight: prefs.lineHeight,
      pageGutter: prefs.margins,
      backgroundColor:
        prefs.theme === "dark"
          ? "#1a1a1a"
          : prefs.theme === "sepia"
            ? "#f4ecd8"
            : undefined,
      textColor: prefs.theme === "dark" ? "#e8e8e8" : undefined,
    });
    void this.navigator.submitPreferences(epubPrefs);
  }

  getCapabilities() {
    return this.capabilities;
  }

  getToc(): TocEntry[] {
    if (!this.publication?.toc?.items.length) return [];
    return linksToToc([...this.publication.toc.items]);
  }

  onTextSelected(cb: (selection: TextSelectionPayload) => void) {
    this.textSelectedCb = cb;
  }

  onOverlayStateChange(cb: (state: OverlayState) => void) {
    this.overlayStateCb = cb;
  }

  private currentSmilPath(): string | null {
    if (!this.publication || !this.currentLocator?.href) return null;
    const bareHref = this.currentLocator.href.split("#")[0]!;
    const link = this.publication.readingOrder.items.find((item) => {
      const path = stripResourceQuery(item.href);
      return path === bareHref || item.href.includes(encodeURIComponent(bareHref));
    });
    const alt = link?.alternates?.items.find((a) =>
      linkHasRel(a, "media-overlay"),
    );
    return alt ? stripResourceQuery(alt.href) : null;
  }

  async playOverlay() {
    const smilPath = this.currentSmilPath();
    if (!smilPath || !this.overlayResourceBase) {
      this.overlayStateCb?.({
        playback: "error",
        error: "No read-along available for this section",
      });
      return;
    }
    await this.overlay.loadSmil(this.overlayResourceBase, smilPath);
    await this.overlay.play();
  }

  pauseOverlay() {
    this.overlay.pause();
  }

  stopOverlay() {
    this.overlay.stop();
  }

  async overlayNextSegment() {
    await this.overlay.nextSegment();
  }

  async overlayPreviousSegment() {
    await this.overlay.previousSegment();
  }

  toggleTts(enabled: boolean) {
    if (!enabled) {
      window.speechSynthesis.cancel();
      return;
    }
    const text = this.container.innerText.slice(0, 500);
    if (!text || !window.speechSynthesis) return;
    this.ttsUtterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(this.ttsUtterance);
  }
}

export function createEpubReader(container: HTMLElement): ReaderAdapter {
  return new EpubReadiumAdapter(container);
}
