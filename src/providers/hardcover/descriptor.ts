import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";
import { HARDCOVER_PROVIDER_FIELD_KEYS } from "./provider-fields.js";

export const hardcoverDescriptor: MetadataSourceDescriptor = {
  id: "hardcover",
  name: "Hardcover",
  mediaModules: ["books", "comics"],
  sourceType: "api",
  sourceCategory: "provider",
  fields: [
    "title",
    "subtitle",
    "authors",
    "isbn10",
    "isbn13",
    "description",
    "publisher",
    "publicationDate",
    "physicalFormat",
    "language",
    "genres",
    "pageCount",
    "series",
    "seriesPosition",
    "cover",
  ],
  providerFields: [
    {
      key: HARDCOVER_PROVIDER_FIELD_KEYS.rating,
      label: "Hardcover rating",
      kind: "rating",
    },
    {
      key: HARDCOVER_PROVIDER_FIELD_KEYS.bookId,
      label: "Hardcover book ID",
      kind: "text",
    },
    {
      key: HARDCOVER_PROVIDER_FIELD_KEYS.slug,
      label: "Hardcover slug",
      kind: "text",
    },
  ],
  configSchema: [
    {
      key: "apiKey",
      label: "API Key",
      type: "secret",
      required: true,
      description:
        "Hardcover GraphQL token (hc_pat_…) or full Bearer hc_pat_… value",
    },
  ],
  implemented: true,
};
