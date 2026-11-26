import type { MetadataProviderRegistry } from "./registry.js";
import { embeddedEpubOpfProvider } from "../../../providers/embedded.epub.opf/provider.js";
import { embeddedFilenameProvider } from "../../../providers/embedded.filename/provider.js";
import { openLibraryProvider } from "../../../providers/open-library/provider.js";
import { hardcoverProvider } from "../../../providers/hardcover/provider.js";
import { lubimyczytacProvider } from "../../../providers/lubimyczytac/provider.js";
import { audibleProvider } from "../../../providers/audible/provider.js";
import { imdbProvider } from "../../../providers/imdb/provider.js";
import { appleBooksProvider } from "../../../providers/apple-books/provider.js";
import { embeddedMusicTagsProvider } from "../../../providers/embedded.music.tags/provider.js";
import { musicbrainzProvider } from "../../../providers/musicbrainz/provider.js";
import { wikidataProvider } from "../../../providers/wikidata/provider.js";
import { METADATA_PROVIDER_CONTRACT } from "../../../shared/metadata-contract/index.js";

const SOURCES = [
  embeddedEpubOpfProvider,
  embeddedFilenameProvider,
  embeddedMusicTagsProvider,
  openLibraryProvider,
  hardcoverProvider,
  lubimyczytacProvider,
  audibleProvider,
  musicbrainzProvider,
  imdbProvider,
  appleBooksProvider,
  wikidataProvider,
];

export function bootstrapMetadataProviders(
  registry: MetadataProviderRegistry,
): void {
  for (const provider of SOURCES) {
    registry.register({
      key: provider.key,
      contractVersion: METADATA_PROVIDER_CONTRACT,
      provider,
    });
  }
}
