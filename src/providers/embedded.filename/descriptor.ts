import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const embeddedFilenameDescriptor: MetadataSourceDescriptor = {
  id: "embedded.filename",
  name: "Filename",
  mediaModules: ["books", "comics", "music"],
  sourceType: "embedded",
  sourceCategory: "imported",
  fields: ["title"],
  implemented: true,
};
