import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { embeddedMusicTagsDescriptor } from "./descriptor.js";

/** Music tag extraction runs in ingest pipeline; provider fetch is a no-op stub. */
export const embeddedMusicTagsProvider: MetadataProvider = {
  key: embeddedMusicTagsDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: embeddedMusicTagsDescriptor,
  async fetch() {
    return null;
  },
};
