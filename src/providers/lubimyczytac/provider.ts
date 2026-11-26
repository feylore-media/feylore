import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { lubimyczytacDescriptor } from "./descriptor.js";

export const lubimyczytacProvider: MetadataProvider = {
  key: lubimyczytacDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: lubimyczytacDescriptor,
  async fetch() {
    return null;
  },
};
