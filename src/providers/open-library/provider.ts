import {
  resolveEditionFormatPreference,
  type EditionFormatPreference,
} from "../../shared/metadata-edition-preference.js";
import type { MediaModuleId } from "../../shared/media-modules.js";
import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataFetchContext,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import {
  fetchOpenLibraryRecords,
  testOpenLibraryConnection,
} from "./client.js";
import { openLibraryDescriptor } from "./descriptor.js";
import { parseOpenLibraryRecords } from "./parser.js";
import { buildSearchPlan } from "./search-strategy.js";
import type { EditionSelectionOptions } from "./edition-resolution.js";

function resolvePreference(context: MetadataFetchContext): EditionFormatPreference {
  if (context.editionFormatPreference) return context.editionFormatPreference;
  const mediaModule = (context.mediaModule ?? "books") as MediaModuleId;
  return resolveEditionFormatPreference(mediaModule);
}

function selectionOptionsFromContext(
  context: MetadataFetchContext,
): EditionSelectionOptions {
  const hints = context.hints;
  const fileFormat =
    typeof hints?.format === "string" ? hints.format : undefined;
  const language =
    typeof hints?.language === "string" ? hints.language : undefined;
  return { fileFormat, language };
}

export const openLibraryProvider: MetadataProvider = {
  key: openLibraryDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: openLibraryDescriptor,
  async fetch(context: MetadataFetchContext) {
    const plan = buildSearchPlan(context.hints, context.matchingRules);
    if (!plan) return null;

    const records = await fetchOpenLibraryRecords(
      plan,
      resolvePreference(context),
      selectionOptionsFromContext(context),
    );
    if (!records) return null;

    return parseOpenLibraryRecords(records);
  },
  async testConnection() {
    await testOpenLibraryConnection();
    return { ok: true, message: "Connected" };
  },
};
