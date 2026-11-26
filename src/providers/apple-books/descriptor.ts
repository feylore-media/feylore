import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const appleBooksDescriptor: MetadataSourceDescriptor = {
  id: "apple-books",
  name: "Apple Books",
  mediaModules: ["books", "audiobooks"],
  sourceType: "api",
  sourceCategory: "provider",
  fields: [
    "title",
    "subtitle",
    "authors",
    "description",
    "publisher",
    "publicationDate",
    "genres",
    "cover",
    "narrator",
  ],
  implemented: false,
};
