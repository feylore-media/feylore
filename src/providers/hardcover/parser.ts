import type { MetadataProviderResult } from "../../shared/metadata-contract/index.js";
import { mapCanonicalFields, resolveExternalId } from "./canonical-map.js";
import { selectEdition } from "./edition-selection.js";
import { mapProviderFields } from "./provider-fields.js";
import type { HardcoverRecords } from "./types.js";

export function parseHardcoverRecords(
  records: HardcoverRecords,
  hints?: Record<string, unknown>,
): MetadataProviderResult | null {
  const { book, editions } = records;
  if (!book) return null;

  const selectedEdition = selectEdition(editions, hints);

  const payload: Record<string, unknown> = {
    ...mapCanonicalFields({ book, selectedEdition }),
    ...mapProviderFields(book),
  };

  if (Object.keys(payload).length === 0) return null;

  return {
    externalId: resolveExternalId(book),
    payload,
  };
}
