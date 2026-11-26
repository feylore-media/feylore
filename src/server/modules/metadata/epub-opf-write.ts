import {
  DOMParser,
  XMLSerializer,
  type Element as XmlElement,
  type Document as XmlDocument,
} from "@xmldom/xmldom";
import type { EpubOpfBibliographic } from "./extractors/epub-opf.js";

function textContent(el: XmlElement | null): string {
  return el?.textContent?.trim() ?? "";
}

function setOrCreateTextElement(
  metadata: XmlElement,
  doc: XmlDocument,
  tagName: string,
  value: string | undefined,
  removeIfEmpty = true,
): void {
  const existing = metadata.getElementsByTagName(tagName);
  if (!value) {
    if (removeIfEmpty) {
      for (let i = existing.length - 1; i >= 0; i--) {
        metadata.removeChild(existing[i]!);
      }
    }
    return;
  }

  let el = existing[0] as XmlElement | undefined;
  if (!el) {
    el = doc.createElement(tagName);
    metadata.appendChild(el);
  }
  el.textContent = value;

  for (let i = existing.length - 1; i > 0; i--) {
    metadata.removeChild(existing[i]!);
  }
}

function setCreators(metadata: XmlElement, doc: XmlDocument, authors: string[]): void {
  const existing = metadata.getElementsByTagName("dc:creator");
  for (let i = existing.length - 1; i >= 0; i--) {
    metadata.removeChild(existing[i]!);
  }
  for (const author of authors) {
    const trimmed = author.trim();
    if (!trimmed) continue;
    const el = doc.createElement("dc:creator");
    el.textContent = trimmed;
    metadata.appendChild(el);
  }
}

function setSubjects(metadata: XmlElement, doc: XmlDocument, subjects: string[]): void {
  const existing = metadata.getElementsByTagName("dc:subject");
  for (let i = existing.length - 1; i >= 0; i--) {
    metadata.removeChild(existing[i]!);
  }
  for (const subject of subjects) {
    const trimmed = subject.trim();
    if (!trimmed) continue;
    const el = doc.createElement("dc:subject");
    el.textContent = trimmed;
    metadata.appendChild(el);
  }
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function setIdentifiers(
  metadata: XmlElement,
  doc: XmlDocument,
  identifiers: EpubOpfBibliographic["identifiers"],
): void {
  const existing = metadata.getElementsByTagName("dc:identifier");
  const preserved: XmlElement[] = [];
  for (let i = 0; i < existing.length; i++) {
    const el = existing[i]!;
    const scheme =
      el.getAttribute("opf:scheme") ?? el.getAttribute("scheme") ?? "";
    const value = normalizeIsbn(textContent(el));
    if (scheme.toLowerCase().includes("isbn") || value.length === 10 || value.length === 13) {
      metadata.removeChild(el);
      continue;
    }
    preserved.push(el);
  }

  for (const id of identifiers) {
    const normalized = normalizeIsbn(id.value);
    if (!normalized) continue;
    const el = doc.createElement("dc:identifier");
    if (id.scheme) {
      el.setAttribute("opf:scheme", id.scheme);
    } else if (normalized.length === 13) {
      el.setAttribute("opf:scheme", "ISBN");
    } else if (normalized.length === 10) {
      el.setAttribute("opf:scheme", "ISBN");
    }
    el.textContent = id.value;
    metadata.appendChild(el);
  }

  for (const el of preserved) {
    if (!el.parentNode) metadata.appendChild(el);
  }
}

function applySubtitle(metadata: XmlElement, doc: XmlDocument, subtitle?: string): void {
  const metaEls = metadata.getElementsByTagName("meta");
  for (let i = metaEls.length - 1; i >= 0; i--) {
    const meta = metaEls[i]!;
    if (meta.getAttribute("property") === "title-type") {
      metadata.removeChild(meta);
    }
  }

  const titleEls = metadata.getElementsByTagName("dc:title");
  for (let i = titleEls.length - 1; i > 0; i--) {
    metadata.removeChild(titleEls[i]!);
  }

  if (!subtitle?.trim()) return;

  const titleEl = titleEls[0] ?? doc.createElement("dc:title");
  if (!titleEl.parentNode) {
    metadata.insertBefore(titleEl, metadata.firstChild);
  }
  if (!titleEl.getAttribute("id")) {
    titleEl.setAttribute("id", "feylore-title");
  }

  const subtitleEl = doc.createElement("dc:title");
  subtitleEl.setAttribute("id", "feylore-subtitle");
  subtitleEl.textContent = subtitle.trim();
  metadata.appendChild(subtitleEl);

  const meta = doc.createElement("meta");
  meta.setAttribute("property", "title-type");
  meta.setAttribute("refines", "#feylore-subtitle");
  meta.textContent = "subtitle";
  metadata.appendChild(meta);
}

export function applyBibliographicToOpf(
  opfXml: string,
  bibliographic: EpubOpfBibliographic,
): string {
  const doc = new DOMParser().parseFromString(opfXml, "text/xml");
  const metadata = doc.getElementsByTagName("metadata")[0];
  if (!metadata) {
    throw new Error("Invalid OPF: missing metadata element");
  }

  setOrCreateTextElement(metadata, doc, "dc:title", bibliographic.title);
  applySubtitle(metadata, doc, bibliographic.subtitle);
  setCreators(metadata, doc, bibliographic.authors);
  setSubjects(metadata, doc, bibliographic.subjects);
  setOrCreateTextElement(metadata, doc, "dc:description", bibliographic.description);
  setOrCreateTextElement(metadata, doc, "dc:language", bibliographic.language);
  setOrCreateTextElement(metadata, doc, "dc:publisher", bibliographic.publisher);
  setOrCreateTextElement(metadata, doc, "dc:date", bibliographic.date);
  setIdentifiers(metadata, doc, bibliographic.identifiers);

  return new XMLSerializer().serializeToString(doc);
}

export function canonicalFieldsToBibliographic(
  fields: Record<string, unknown>,
): EpubOpfBibliographic {
  const identifiers: EpubOpfBibliographic["identifiers"] = [];
  if (typeof fields.isbn13 === "string" && fields.isbn13) {
    identifiers.push({ value: fields.isbn13, scheme: "ISBN" });
  }
  if (typeof fields.isbn10 === "string" && fields.isbn10) {
    identifiers.push({ value: fields.isbn10, scheme: "ISBN" });
  }
  if (Array.isArray(fields.identifiers)) {
    for (const entry of fields.identifiers) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "value" in entry &&
        typeof (entry as { value: unknown }).value === "string"
      ) {
        const typed = entry as { value: string; scheme?: string };
        identifiers.push({ value: typed.value, scheme: typed.scheme });
      }
    }
  }

  return {
    title: typeof fields.title === "string" && fields.title ? fields.title : "Untitled",
    subtitle: typeof fields.subtitle === "string" ? fields.subtitle : undefined,
    description:
      typeof fields.description === "string" ? fields.description : undefined,
    authors: Array.isArray(fields.authors)
      ? fields.authors.filter((a): a is string => typeof a === "string")
      : [],
    subjects: Array.isArray(fields.genres)
      ? fields.genres.filter((g): g is string => typeof g === "string")
      : [],
    language: typeof fields.language === "string" ? fields.language : undefined,
    publisher: typeof fields.publisher === "string" ? fields.publisher : undefined,
    date:
      typeof fields.publicationDate === "string"
        ? fields.publicationDate
        : undefined,
    identifiers,
  };
}
