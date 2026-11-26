import type { MetadataSourceDescriptor } from "../../shared/metadata-contract/index.js";

export const wikidataDescriptor: MetadataSourceDescriptor = {
  id: "wikidata",
  name: "Wikidata",
  mediaModules: ["people"],
  sourceType: "api",
  sourceCategory: "provider",
  fields: [
    "name",
    "alternateNames",
    "bio",
    "birthDate",
    "deathDate",
    "birthPlace",
    "deathPlace",
    "personalUrl",
    "photo",
  ],
  providerFields: [
    {
      key: "wikidataQid",
      label: "Wikidata ID",
      kind: "text",
    },
    {
      key: "wikipediaUrl",
      label: "Wikipedia",
      kind: "text",
    },
    {
      key: "occupations",
      label: "Occupations",
      kind: "text",
    },
    {
      key: "nationality",
      label: "Nationality",
      kind: "text",
    },
  ],
  implemented: true,
};