import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const imdbDescriptor: MetadataSourceDescriptor = {
  id: "imdb",
  name: "IMDb",
  mediaModules: ["video"],
  sourceType: "api",
  sourceCategory: "provider",
  fields: [
    "title",
    "description",
    "genres",
    "cover",
    "director",
    "cast",
    "releaseDate",
    "runtime",
    "rating",
    "studio",
  ],
  implemented: false,
};
