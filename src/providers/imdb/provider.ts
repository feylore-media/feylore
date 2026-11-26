import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { imdbDescriptor } from "./descriptor.js";

export const imdbProvider: MetadataProvider = {
  key: imdbDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: imdbDescriptor,
  async fetch() {
    return null;
  },
};
