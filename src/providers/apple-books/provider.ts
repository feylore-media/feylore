import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { appleBooksDescriptor } from "./descriptor.js";

export const appleBooksProvider: MetadataProvider = {
  key: appleBooksDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: appleBooksDescriptor,
  async fetch() {
    return null;
  },
};
