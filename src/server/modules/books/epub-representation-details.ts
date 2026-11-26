import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { FileService } from "../files/service.js";
import type {
  EpubTechnicalSummary,
  RepresentationCapabilities,
} from "../../../shared/books.js";
import {
  EXTRACTOR_EPUB_OPF,
  extractEpubOpfFromFile,
  readEpubContainer,
  parseOpf,
} from "../metadata/extractors/epub-opf.js";

export interface EpubRepresentationDetails {
  capabilities: RepresentationCapabilities;
  technical: EpubTechnicalSummary;
}

function layoutFromReadingOrder(
  readingOrder: Array<{ properties?: string[] }>,
): "fixed" | "reflowable" | undefined {
  const isFixed = readingOrder.some((item) =>
    item.properties?.includes("rendition:layout-pre-paginated"),
  );
  return isFixed ? "fixed" : "reflowable";
}

function epubVersionFromOpfXml(opfXml: string): string | undefined {
  const match = opfXml.match(/<package[^>]*\bversion="([^"]+)"/i);
  return match?.[1];
}

export async function resolveEpubRepresentationDetails(
  db: Database,
  files: FileService,
  fileId: string,
  fileMeta: {
    size: number;
    checksum: string | null;
    mediaType: string | null;
  },
): Promise<EpubRepresentationDetails | null> {
  const stored = await db.query.fileTechnicalMetadata.findFirst({
    where: and(
      eq(schema.fileTechnicalMetadata.fileId, fileId),
      eq(schema.fileTechnicalMetadata.extractor, EXTRACTOR_EPUB_OPF),
    ),
  });

  let language: string | undefined;
  let mediaOverlays: boolean | undefined;
  let layout: "fixed" | "reflowable" | undefined;
  let hasNavigation: boolean | undefined;
  let epubVersion: string | undefined;

  if (stored?.payload) {
    const payload = stored.payload;
    if (typeof payload.language === "string") language = payload.language;
    if (payload.mediaOverlayMeta) mediaOverlays = true;
    if (typeof payload.navHref === "string") hasNavigation = true;
    if (payload.layout === "fixed" || payload.layout === "reflowable") {
      layout = payload.layout;
    }
    if (typeof payload.epubVersion === "string") epubVersion = payload.epubVersion;
  }

  if (
    mediaOverlays === undefined ||
    layout === undefined ||
    epubVersion === undefined
  ) {
    try {
      const { zip } = await extractEpubOpfFromFile(files, fileId);
      const { opfDir, opfXml } = await readEpubContainer(zip);
      const parsed = parseOpf(opfXml, opfDir);

      if (language === undefined && parsed.language) language = parsed.language;
      if (mediaOverlays === undefined) {
        mediaOverlays = !!parsed.mediaOverlayMeta;
      }
      if (layout === undefined) {
        layout = layoutFromReadingOrder(parsed.readingOrder);
      }
      if (hasNavigation === undefined) {
        hasNavigation = !!parsed.navHref;
      }
      if (epubVersion === undefined) {
        epubVersion = epubVersionFromOpfXml(opfXml);
      }
    } catch {
      // Use only stored metadata when live parse fails.
    }
  }

  const capabilities: RepresentationCapabilities = {};
  if (epubVersion) capabilities.epubVersion = epubVersion;
  if (mediaOverlays === true) capabilities.mediaOverlays = true;
  if (layout) capabilities.layout = layout;

  const technical: EpubTechnicalSummary = {
    ...capabilities,
    language,
    hasNavigation,
    fileSize: fileMeta.size,
    checksum: fileMeta.checksum ?? undefined,
    mediaType: fileMeta.mediaType,
  };

  return { capabilities, technical };
}
