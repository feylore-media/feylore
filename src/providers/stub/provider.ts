import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";

/** Test stub provider — proves registration without shipping real providers */
export const stubProvider: MetadataProvider = {
  key: "stub",
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: {
    id: "stub",
    name: "Stub",
    mediaModules: ["books"],
    sourceType: "local",
    fields: ["title"],
    implemented: true,
  },
  async fetch() {
    return { payload: { title: "Stub metadata" } };
  },
};
