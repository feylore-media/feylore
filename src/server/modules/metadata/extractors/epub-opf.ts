import JSZip from "jszip";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import { normalizeRelativePath, normalizeZipEntryPath } from "../../../security/paths.js";
import type { FileService } from "../../files/service.js";

export const EXTRACTOR_EPUB_OPF = "embedded.epub.opf" as const;

export interface OpfManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
  mediaOverlay?: string;
}

export interface OpfIdentifier {
  value: string;
  scheme?: string;
}

export interface EpubOpfCover {
  href: string;
  mediaType: string;
}

export interface EpubOpfBibliographic {
  title: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  subjects: string[];
  language?: string;
  publisher?: string;
  date?: string;
  identifiers: OpfIdentifier[];
  cover?: EpubOpfCover;
}

export interface ParsedOpf {
  title: string;
  subtitle?: string;
  readingOrder: Array<{
    href: string;
    type: string;
    properties?: string[];
    alternates?: Array<{ href: string; type: string; rel: string[] }>;
  }>;
  items: Map<string, OpfManifestItem>;
  authors: string[];
  subjects: string[];
  description?: string;
  language?: string;
  publisher?: string;
  date?: string;
  identifiers: OpfIdentifier[];
  cover?: EpubOpfCover;
  mediaOverlayMeta?: { activeClass?: string; playbackActiveClass?: string };
  navHref?: string;
}

function textContent(el: XmlElement | null): string {
  return el?.textContent?.trim() ?? "";
}

function resolveHref(base: string, href: string): string {
  if (href.startsWith("/")) return href.slice(1);
  if (!base) return href;
  const parts = base.split("/");
  parts.pop();
  for (const segment of href.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/");
}

function resolveManifestHref(opfDir: string, href: string): string {
  const resolved = opfDir ? `${opfDir}/${href}`.replace(/\/+/g, "/") : href;
  return normalizeRelativePath(resolved);
}

function parseIdentifiers(metadata: XmlElement): OpfIdentifier[] {
  const identifiers: OpfIdentifier[] = [];
  const idEls = metadata.getElementsByTagName("dc:identifier");
  for (let i = 0; i < idEls.length; i++) {
    const el = idEls[i]!;
    const value = textContent(el);
    if (!value) continue;
    const scheme =
      el.getAttribute("opf:scheme") ??
      el.getAttribute("scheme") ??
      undefined;
    identifiers.push({ value, scheme });
  }
  return identifiers;
}

function parseTitles(metadata: XmlElement): { title: string; subtitle?: string } {
  const titleEls = metadata.getElementsByTagName("dc:title");
  const titles: string[] = [];
  for (let i = 0; i < titleEls.length; i++) {
    const t = textContent(titleEls[i] ?? null);
    if (t) titles.push(t);
  }

  let subtitle: string | undefined;
  const metaEls = metadata.getElementsByTagName("meta");
  for (let i = 0; i < metaEls.length; i++) {
    const meta = metaEls[i]!;
    if (meta.getAttribute("property") === "title-type") {
      const refines = meta.getAttribute("refines");
      const titleType = textContent(meta);
      if (titleType === "subtitle" && refines) {
        const refId = refines.replace(/^#/, "");
        for (let j = 0; j < titleEls.length; j++) {
          const el = titleEls[j]!;
          if (el.getAttribute("id") === refId) {
            subtitle = textContent(el);
            break;
          }
        }
      }
    }
  }

  if (!subtitle && titles.length > 1) {
    subtitle = titles.slice(1).join(": ");
  }

  return {
    title: titles[0] ?? "Untitled",
    subtitle,
  };
}

function findCover(
  metadata: XmlElement | undefined,
  items: Map<string, OpfManifestItem>,
): EpubOpfCover | undefined {
  for (const item of items.values()) {
    if (item.properties?.split(/\s+/).includes("cover-image")) {
      return { href: item.href, mediaType: item.mediaType };
    }
  }

  if (metadata) {
    const metaEls = metadata.getElementsByTagName("meta");
    for (let i = 0; i < metaEls.length; i++) {
      const meta = metaEls[i]!;
      if (meta.getAttribute("name") === "cover") {
        const coverId = textContent(meta);
        const item = items.get(coverId);
        if (item) {
          return { href: item.href, mediaType: item.mediaType };
        }
      }
    }
  }

  return undefined;
}

export function parseOpf(opfXml: string, opfDir: string): ParsedOpf {
  const doc = new DOMParser().parseFromString(opfXml, "text/xml");
  const metadata = doc.getElementsByTagName("metadata")[0];
  const manifestEls = doc.getElementsByTagName("item");
  const spineEls = doc.getElementsByTagName("itemref");

  const { title, subtitle } = metadata
    ? parseTitles(metadata)
    : { title: "Untitled" as const };

  const items = new Map<string, OpfManifestItem>();

  for (let i = 0; i < manifestEls.length; i++) {
    const el = manifestEls[i]!;
    const id = el.getAttribute("id");
    const href = el.getAttribute("href");
    const mediaType = el.getAttribute("media-type") ?? "application/octet-stream";
    const properties = el.getAttribute("properties") ?? undefined;
    const mediaOverlay = el.getAttribute("media-overlay") ?? undefined;
    if (id && href) {
      items.set(id, {
        id,
        href: resolveManifestHref(opfDir, href),
        mediaType,
        properties,
        mediaOverlay,
      });
    }
  }

  let mediaOverlayMeta: { activeClass?: string; playbackActiveClass?: string } | undefined;
  if (metadata) {
    const metaEls = metadata.getElementsByTagName("meta");
    let activeClass: string | undefined;
    let playbackActiveClass: string | undefined;
    for (let i = 0; i < metaEls.length; i++) {
      const meta = metaEls[i]!;
      const property = meta.getAttribute("property");
      if (property === "media:active-class") {
        activeClass = textContent(meta);
      } else if (property === "media:playback-active-class") {
        playbackActiveClass = textContent(meta);
      }
    }
    if (activeClass || playbackActiveClass) {
      mediaOverlayMeta = { activeClass, playbackActiveClass };
    }
  }

  const overlayIdToHref = new Map<string, string>();
  for (const item of items.values()) {
    if (item.mediaType === "application/smil+xml") {
      overlayIdToHref.set(item.id, item.href);
    }
  }

  const readingOrder: ParsedOpf["readingOrder"] = [];

  for (let i = 0; i < spineEls.length; i++) {
    const spineEl = spineEls[i]!;
    const idref = spineEl.getAttribute("idref");
    if (!idref || !items.has(idref)) continue;
    const item = items.get(idref)!;
    const entry: (typeof readingOrder)[number] = {
      href: item.href,
      type: item.mediaType,
    };
    const props: string[] = [];
    if (item.properties) {
      props.push(...item.properties.split(/\s+/).filter(Boolean));
    }
    if (item.mediaOverlay) {
      const overlayHref = overlayIdToHref.get(item.mediaOverlay);
      if (overlayHref) {
        entry.alternates = [
          {
            href: overlayHref,
            type: "application/smil+xml",
            rel: ["media-overlay"],
          },
        ];
      }
    }
    if (props.length > 0) entry.properties = props;
    readingOrder.push(entry);
  }

  const authors: string[] = [];
  const subjects: string[] = [];
  let description: string | undefined;
  let language: string | undefined;
  let publisher: string | undefined;
  let date: string | undefined;
  let identifiers: OpfIdentifier[] = [];

  if (metadata) {
    const creatorEls = metadata.getElementsByTagName("dc:creator");
    for (let i = 0; i < creatorEls.length; i++) {
      const name = textContent(creatorEls[i] ?? null);
      if (name) authors.push(name);
    }

    const subjectEls = metadata.getElementsByTagName("dc:subject");
    for (let i = 0; i < subjectEls.length; i++) {
      const s = textContent(subjectEls[i] ?? null);
      if (s) subjects.push(s);
    }

    description =
      textContent(metadata.getElementsByTagName("dc:description")[0] ?? null) ||
      undefined;
    language =
      textContent(metadata.getElementsByTagName("dc:language")[0] ?? null) ||
      undefined;
    publisher =
      textContent(metadata.getElementsByTagName("dc:publisher")[0] ?? null) ||
      undefined;
    date =
      textContent(metadata.getElementsByTagName("dc:date")[0] ?? null) ||
      undefined;
    identifiers = parseIdentifiers(metadata);
  }

  let navHref: string | undefined;
  for (const item of items.values()) {
    if (item.properties?.split(/\s+/).includes("nav")) {
      navHref = item.href;
      break;
    }
  }

  const cover = findCover(metadata, items);

  return {
    title,
    subtitle,
    readingOrder,
    items,
    authors,
    subjects,
    description,
    language,
    publisher,
    date,
    identifiers,
    cover,
    mediaOverlayMeta,
    navHref,
  };
}

export function toBibliographic(parsed: ParsedOpf): EpubOpfBibliographic {
  return {
    title: parsed.title,
    subtitle: parsed.subtitle,
    description: parsed.description,
    authors: parsed.authors,
    subjects: parsed.subjects,
    language: parsed.language,
    publisher: parsed.publisher,
    date: parsed.date,
    identifiers: parsed.identifiers,
    cover: parsed.cover,
  };
}

export interface EpubContainerInfo {
  opfPath: string;
  opfDir: string;
  opfXml: string;
}

export async function readEpubContainer(
  zip: JSZip,
): Promise<EpubContainerInfo> {
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

  const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml");
  const rootfile = containerDoc.getElementsByTagName("rootfile")[0];
  const rawOpfPath = rootfile?.getAttribute("full-path");
  if (!rawOpfPath) throw new Error("Invalid EPUB: missing rootfile");

  const opfPath = normalizeZipEntryPath(rawOpfPath);
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("Invalid EPUB: missing OPF");

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/"))
    : "";

  return { opfPath, opfDir, opfXml };
}

export async function readEpubZipFromFile(
  files: FileService,
  fileId: string,
): Promise<{ zip: JSZip; buffer: Buffer }> {
  await files.getFile(fileId);
  const { stream } = await files.getStream(fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const zip = await JSZip.loadAsync(buffer);
  return { zip, buffer };
}

export async function extractEpubOpfFromFile(
  files: FileService,
  fileId: string,
): Promise<{ bibliographic: EpubOpfBibliographic; zip: JSZip }> {
  const { zip } = await readEpubZipFromFile(files, fileId);
  const { opfDir, opfXml } = await readEpubContainer(zip);
  const parsed = parseOpf(opfXml, opfDir);
  return { bibliographic: toBibliographic(parsed), zip };
}

export function resolveHrefForNav(base: string, href: string): string {
  return resolveHref(base, href);
}

export interface TocLink {
  href: string;
  title: string;
  children?: TocLink[];
}

export function parseNavDocument(navHtml: string, navDir: string): TocLink[] {
  const doc = new DOMParser().parseFromString(navHtml, "text/html");
  const navEls = doc.getElementsByTagName("nav");
  const navEl = navEls.length > 0 ? navEls[0] : null;

  if (!navEl) return [];

  function parseOl(ol: XmlElement): TocLink[] {
    const entries: TocLink[] = [];
    const lis = ol.getElementsByTagName("li");
    for (let i = 0; i < lis.length; i++) {
      const li = lis[i]!;
      if (li.parentElement !== ol) continue;
      const links = li.getElementsByTagName("a");
      const a = links.length > 0 ? links[0] : null;
      if (!a) continue;
      const href = a.getAttribute("href");
      if (!href) continue;
      const ols = li.getElementsByTagName("ol");
      let childOl: XmlElement | null = null;
      for (let j = 0; j < ols.length; j++) {
        if (ols[j]!.parentElement === li) {
          childOl = ols[j]!;
          break;
        }
      }
      entries.push({
        href: resolveHref(navDir, href.split("#")[0] ?? href),
        title: textContent(a),
        children: childOl ? parseOl(childOl) : undefined,
      });
    }
    return entries;
  }

  const ols = navEl.getElementsByTagName("ol");
  const ol = ols.length > 0 ? ols[0] : null;
  return ol ? parseOl(ol) : [];
}

export function detectIsbn(identifiers: OpfIdentifier[]): {
  type: string;
  value: string;
} | null {
  for (const id of identifiers) {
    const normalized = id.value.replace(/[-\s]/g, "");
    const scheme = id.scheme?.toLowerCase() ?? "";
    if (
      scheme.includes("isbn") ||
      /^97[89]\d{10}$/.test(normalized) ||
      /^\d{10}$/.test(normalized)
    ) {
      return { type: "isbn", value: id.value };
    }
  }
  return null;
}
