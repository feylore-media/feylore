import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import { embeddedEpubOpfDescriptor } from "./descriptor.js";

/** OPF extraction runs in ingest pipeline; provider fetch is a no-op stub. */
export const embeddedEpubOpfProvider: MetadataProvider = {
  key: embeddedEpubOpfDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: embeddedEpubOpfDescriptor,
  async fetch() {
    return null;
  },
};
