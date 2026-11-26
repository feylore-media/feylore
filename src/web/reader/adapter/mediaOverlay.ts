import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import { cachedFetch } from "../../downloads/cachedFetch.js";
import type { OverlayState } from "./types.js";

export interface SmilSegment {
  textHref: string;
  textFragment?: string;
  audioSrc: string;
  clipBegin: number;
  clipEnd: number;
  label?: string;
}

function parseTime(value: string | null): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (trimmed.endsWith("ms")) return parseFloat(trimmed) / 1000;
  if (trimmed.endsWith("min")) return parseFloat(trimmed) * 60;
  if (trimmed.endsWith("h")) return parseFloat(trimmed) * 3600;
  return parseFloat(trimmed.replace(/s$/, "")) || 0;
}

export function parseSmilDocument(xml: string, smilHref: string): SmilSegment[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const smilDir = smilHref.includes("/")
    ? smilHref.slice(0, smilHref.lastIndexOf("/"))
    : "";

  function resolve(path: string): string {
    if (path.startsWith("/")) return path.slice(1);
    if (!smilDir) return path;
    const parts = smilDir.split("/");
    for (const segment of path.split("/")) {
      if (segment === "..") parts.pop();
      else if (segment !== "." && segment !== "") parts.push(segment);
    }
    return parts.join("/");
  }

  const segments: SmilSegment[] = [];

  function walk(node: XmlElement) {
    const localName = node.localName ?? node.tagName;
    if (localName === "par") {
      const textEls = node.getElementsByTagName("text");
      const audioEls = node.getElementsByTagName("audio");
      const textEl = textEls.length > 0 ? textEls[0] : null;
      const audioEl = audioEls.length > 0 ? audioEls[0] : null;
      if (textEl && audioEl) {
        const textSrc = textEl.getAttribute("src") ?? "";
        const [href, fragment] = textSrc.split("#");
        const audioSrc = resolve(audioEl.getAttribute("src") ?? "");
        segments.push({
          textHref: resolve(href ?? textSrc),
          textFragment: fragment,
          audioSrc,
          clipBegin: parseTime(audioEl.getAttribute("clipBegin")),
          clipEnd: parseTime(audioEl.getAttribute("clipEnd")),
        });
      }
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child && "tagName" in child && (child as XmlElement).tagName) {
        walk(child as XmlElement);
      }
    }
  }

  const bodies = doc.getElementsByTagName("body");
  const body = bodies.length > 0 ? bodies[0]! : doc.documentElement;
  if (body) walk(body);
  return segments;
}

export class MediaOverlayController {
  private audio: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;
  private segments: SmilSegment[] = [];
  private currentIndex = 0;
  private resourceBaseUrl = "";
  private stateCb: ((state: OverlayState) => void) | null = null;
  private onSegmentChange: ((segment: SmilSegment) => void) | null = null;
  private rafId: number | null = null;

  setStateCallback(cb: (state: OverlayState) => void) {
    this.stateCb = cb;
  }

  setSegmentChangeCallback(cb: (segment: SmilSegment) => void) {
    this.onSegmentChange = cb;
  }

  private emit(state: OverlayState) {
    this.stateCb?.(state);
  }

  async loadSmil(resourceBaseUrl: string, smilPath: string) {
    this.resourceBaseUrl = resourceBaseUrl;
    this.emit({ playback: "loading" });
    const url = `${resourceBaseUrl}?path=${encodeURIComponent(smilPath)}`;
    const res = await cachedFetch(url, { credentials: "include" });
    if (!res.ok) {
      this.emit({ playback: "error", error: "Could not load read-along audio" });
      throw new Error("SMIL fetch failed");
    }
    const xml = await res.text();
    this.segments = parseSmilDocument(xml, smilPath);
    if (this.segments.length === 0) {
      this.emit({ playback: "error", error: "No read-along segments found" });
      throw new Error("Empty SMIL");
    }
    this.currentIndex = 0;
    this.emit({ playback: "idle", segmentProgress: 0 });
  }

  async play() {
    if (this.segments.length === 0) return;
    await this.playSegment(this.currentIndex);
  }

  pause() {
    this.audio?.pause();
    this.stopRaf();
    this.emit({
      playback: "paused",
      segmentProgress: this.getSegmentProgress(),
    });
  }

  stop() {
    this.stopRaf();
    this.releaseAudio();
    this.emit({ playback: "idle", segmentProgress: 0 });
  }

  async nextSegment() {
    if (this.currentIndex < this.segments.length - 1) {
      await this.playSegment(this.currentIndex + 1);
      return true;
    }
    this.stop();
    return false;
  }

  async previousSegment() {
    if (this.currentIndex > 0) {
      await this.playSegment(this.currentIndex - 1);
      return true;
    }
    return false;
  }

  destroy() {
    this.stop();
    this.segments = [];
    this.stateCb = null;
    this.onSegmentChange = null;
  }

  private getSegmentProgress(): number {
    if (!this.audio || this.segments.length === 0) return 0;
    const seg = this.segments[this.currentIndex]!;
    const duration = seg.clipEnd - seg.clipBegin;
    if (duration <= 0) return 0;
    return Math.min(
      1,
      Math.max(0, (this.audio.currentTime - seg.clipBegin) / duration),
    );
  }

  private stopRaf() {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = () => {
    this.emit({
      playback: "playing",
      segmentProgress: this.getSegmentProgress(),
      segmentLabel: `Segment ${this.currentIndex + 1} of ${this.segments.length}`,
    });
    this.rafId = requestAnimationFrame(this.tick);
  };

  private releaseAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
  }

  private async playSegment(index: number) {
    this.stopRaf();
    this.releaseAudio();

    const seg = this.segments[index];
    if (!seg) return;

    this.currentIndex = index;
    this.onSegmentChange?.(seg);

    const audioUrl = `${this.resourceBaseUrl}?path=${encodeURIComponent(seg.audioSrc)}`;
    const res = await cachedFetch(audioUrl, { credentials: "include" });
    if (!res.ok) {
      this.emit({ playback: "error", error: "Audio could not be loaded" });
      throw new Error("Audio fetch failed");
    }
    const blob = await res.blob();
    this.audioObjectUrl = URL.createObjectURL(blob);
    const audio = new Audio(this.audioObjectUrl);
    audio.currentTime = seg.clipBegin;
    this.audio = audio;

    this.emit({ playback: "loading" });

    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("canplay", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Audio load failed")), {
        once: true,
      });
    }).catch(() => {
      this.emit({ playback: "error", error: "Audio could not be loaded" });
      throw new Error("Audio load failed");
    });

    audio.addEventListener("timeupdate", () => {
      if (audio.currentTime >= seg.clipEnd) {
        void this.onSegmentEnded();
      }
    });

    this.emit({
      playback: "playing",
      segmentProgress: 0,
      segmentLabel: `Segment ${index + 1} of ${this.segments.length}`,
    });

    this.rafId = requestAnimationFrame(this.tick);
    await audio.play();
  }

  private async onSegmentEnded() {
    if (this.currentIndex < this.segments.length - 1) {
      await this.playSegment(this.currentIndex + 1);
    } else {
      this.stop();
    }
  }
}
