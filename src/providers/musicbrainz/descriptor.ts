import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const musicbrainzDescriptor: MetadataSourceDescriptor = {
  id: "musicbrainz",
  name: "MusicBrainz",
  mediaModules: ["music"],
  sourceType: "api",
  sourceCategory: "provider",
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
