import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const audibleDescriptor: MetadataSourceDescriptor = {
  id: "audible",
  name: "Audible",
  mediaModules: ["audiobooks"],
  sourceType: "api",
  sourceCategory: "provider",
  fields: [
    "title",
    "authors",
    "narrator",
    "description",
    "runtime",
    "genres",
    "cover",
    "series",
    "releaseDate",
  ],
  configSchema: [
    {
      key: "apiKey",
      label: "API Key",
      type: "secret",
      required: false,
      description: "Audible API credentials (future)",
    },
  ],
  implemented: true,
};
