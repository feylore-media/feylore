import JSZip from "jszip";
import type { FileService } from "../files/service.js";
import { normalizeRelativePath } from "../../security/paths.js";
import {
  parseOpf,
  parseNavDocument,
  readEpubContainer,
  readEpubZipFromFile,
} from "../metadata/extractors/epub-opf.js";

interface TocLink {
  href: string;
  title: string;
  children?: TocLink[];
}

function tocToManifestLinks(
  entries: TocLink[],
  baseResourceUrl: string,
): Array<{ href: string; type: string; title: string; children?: unknown[] }> {
  return entries.map((entry) => ({
    href: `${baseResourceUrl}?path=${encodeURIComponent(entry.href)}`,
    type: "application/xhtml+xml",
    title: entry.title,
    children: entry.children
      ? tocToManifestLinks(entry.children, baseResourceUrl)
      : undefined,
  }));
}

export class EpubPublicationService {
  constructor(private readonly files: FileService) {}

  normalizeResourcePath(resourcePath: string): string {
    return normalizeRelativePath(resourcePath.replace(/\\/g, "/"));
  }

  async buildManifest(fileId: string, baseResourceUrl: string) {
    const { zip } = await readEpubZipFromFile(this.files, fileId);
    const { opfDir, opfXml } = await readEpubContainer(zip);

    const { title, readingOrder, items, authors, mediaOverlayMeta, navHref } =
      parseOpf(opfXml, opfDir);

    let toc: ReturnType<typeof tocToManifestLinks> | undefined;
    if (navHref) {
      const navHtml = await zip.file(navHref)?.async("string");
      if (navHtml) {
        const navDir = navHref.includes("/")
          ? navHref.slice(0, navHref.lastIndexOf("/"))
          : "";
        const tocEntries = parseNavDocument(navHtml, navDir);
        if (tocEntries.length > 0) {
          toc = tocToManifestLinks(tocEntries, baseResourceUrl);
        }
      }
    }

    const resources = [...items.values()].map((item) => ({
      href: `${baseResourceUrl}?path=${encodeURIComponent(item.href)}`,
      type: item.mediaType,
    }));

    const metadata: Record<string, unknown> = {
      "@type": "https://schema.org/Book",
      title,
      author: authors.map((name) => ({ name })),
    };

    if (mediaOverlayMeta) {
      metadata.mediaOverlay = mediaOverlayMeta;
    }

    const layout = readingOrder.some((item) =>
      item.properties?.includes("rendition:layout-pre-paginated"),
    )
      ? "fixed"
      : "reflowable";

    metadata.layout = layout;

    return {
      manifest: {
        "@context": "https://readium.org/webpub-manifest/context.jsonld",
        metadata,
        links: [],
        readingOrder: readingOrder.map((item) => ({
          href: `${baseResourceUrl}?path=${encodeURIComponent(item.href)}`,
          type: item.type,
          ...(item.properties ? { properties: item.properties } : {}),
          ...(item.alternates
            ? {
                alternates: item.alternates.map((alt) => ({
                  href: `${baseResourceUrl}?path=${encodeURIComponent(alt.href)}`,
                  type: alt.type,
                  rel: alt.rel,
                })),
              }
            : {}),
        })),
        resources,
        ...(toc ? { toc } : {}),
      },
      zip,
    };
  }

  async readResource(
    fileId: string,
    resourcePath: string,
  ): Promise<{ data: Buffer; mediaType: string }> {
    const normalized = this.normalizeResourcePath(resourcePath);
    const file = await this.files.getFile(fileId);
    const { stream } = await this.files.getStream(fileId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    const entry = zip.file(normalized);
    if (!entry) throw new Error("Resource not found in EPUB");
    const data = Buffer.from(await entry.async("arraybuffer"));
    const ext = normalized.split(".").pop()?.toLowerCase() ?? "";
    const mediaTypes: Record<string, string> = {
      xhtml: "application/xhtml+xml",
      html: "text/html",
      css: "text/css",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      svg: "image/svg+xml",
      ncx: "application/x-dtbncx+xml",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      smil: "application/smil+xml",
    };
    return {
      data,
      mediaType: mediaTypes[ext] ?? file.mediaType ?? "application/octet-stream",
    };
  }
}
