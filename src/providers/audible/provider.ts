import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataFetchContext,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { outboundFetchJson } from "../../server/modules/metadata/outbound-fetch.js";
import { audibleDescriptor } from "./descriptor.js";

interface AudNexusBook {
  asin?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  authors?: Array<{ name?: string }>;
  narrators?: Array<{ name?: string }>;
  genres?: string[];
  seriesPrimary?: { name?: string; position?: number };
  runtimeLengthMin?: number;
  releaseDate?: string;
  image?: string;
}

async function fetchAudNexusBook(asin: string): Promise<AudNexusBook | null> {
  try {
    return await outboundFetchJson<AudNexusBook>(
      `https://api.audnex.us/books/${encodeURIComponent(asin)}`,
    );
  } catch {
    return null;
  }
}

export const audibleProvider: MetadataProvider = {
  key: audibleDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: { ...audibleDescriptor, implemented: true },
  async fetch(context: MetadataFetchContext) {
    const hints = context.hints ?? {};
    const asin =
      typeof hints.asin === "string"
        ? hints.asin
        : typeof hints.externalId === "string"
          ? hints.externalId
          : undefined;

    if (!asin) return null;

    const book = await fetchAudNexusBook(asin);
    if (!book) return null;

    const payload: Record<string, unknown> = { asin: book.asin ?? asin };
    if (book.title) payload.title = book.title;
    if (book.subtitle) payload.subtitle = book.subtitle;
    if (book.description) payload.description = book.description;

    const authors = book.authors
      ?.map((a) => a.name)
      .filter((n): n is string => Boolean(n));
    if (authors?.length) payload.authors = authors;

    const narrators = book.narrators
      ?.map((n) => n.name)
      .filter((n): n is string => Boolean(n));
    if (narrators?.length) {
      payload.narrator = narrators[0];
      payload.narrators = narrators;
    }

    if (book.genres?.length) payload.genres = book.genres;
    if (book.seriesPrimary?.name) payload.series = book.seriesPrimary.name;
    if (book.runtimeLengthMin) {
      payload.runtime = book.runtimeLengthMin * 60;
    }
    if (book.releaseDate) payload.releaseDate = book.releaseDate;
    if (book.image) payload.cover = { url: book.image };

    return {
      externalId: asin,
      payload,
    };
  },
};
