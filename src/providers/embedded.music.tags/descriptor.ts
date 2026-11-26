import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const embeddedMusicTagsDescriptor: MetadataSourceDescriptor = {
  id: "embedded.music.tags",
  name: "Embedded music tags",
  mediaModules: ["music"],
  sourceType: "embedded",
  sourceCategory: "imported",
  fields: [
    "title",
    "authors",
    "description",
    "genres",
    "releaseDate",
    "cover",
    "runtime",
  ],
  implemented: true,
};
