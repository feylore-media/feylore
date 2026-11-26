import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { embeddedFilenameDescriptor } from "./descriptor.js";

/** Filename extraction runs in ingest pipeline; provider fetch is a no-op stub. */
export const embeddedFilenameProvider: MetadataProvider = {
  key: embeddedFilenameDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: embeddedFilenameDescriptor,
  async fetch() {
    return null;
  },
};
