import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const lubimyczytacDescriptor: MetadataSourceDescriptor = {
  id: "lubimyczytac",
  name: "Lubimyczytac",
  mediaModules: ["books"],
  sourceType: "regional",
  sourceCategory: "provider",
  region: { code: "PL", label: "Poland" },
  fields: ["title", "authors", "isbn13", "description", "publisher", "cover"],
  implemented: false,
};
