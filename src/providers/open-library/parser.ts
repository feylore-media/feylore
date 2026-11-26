import type { MetadataProviderResult } from "../../shared/metadata-contract/index.js";
import { mapCanonicalFields, resolveExternalId } from "./canonical-map.js";
import { mapProviderFields } from "./provider-fields.js";
import type { OpenLibraryRecords } from "./types.js";

export function parseOpenLibraryRecords(
  records: OpenLibraryRecords,
): MetadataProviderResult | null {
  const externalId = resolveExternalId(records);
  if (
    !records.edition &&
    !records.work &&
    !records.searchDoc &&
    !records.searchEdition
  ) {
    return null;
  }

  const payload: Record<string, unknown> = {
    ...mapCanonicalFields(records),
    ...mapProviderFields(records),
  };

  if (Object.keys(payload).length === 0) return null;

  return {
    externalId,
    payload,
  };
}
