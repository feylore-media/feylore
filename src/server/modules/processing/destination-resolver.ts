import path from "node:path";
import {
  getDestinationIntent,
  type ArchiveDestinationIntent,
  type DestinationResolutionStatus,
  type ProcessingModuleId,
} from "../../../shared/processing-policy.js";

export interface StorageLocationInfo {
  id: string;
  name: string;
  rootPath: string;
  kind: string;
}

export interface ResolvedDestination {
  intent: string;
  status: DestinationResolutionStatus;
  displayPath: string | null;
  storageLocationId: string | null;
}

function normalizeMountKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .pop() ?? value.toLowerCase();
}

function mountMatchesIntent(
  location: StorageLocationInfo,
  intent: string,
): boolean {
  const key = normalizeMountKey(location.rootPath);
  const nameKey = normalizeMountKey(location.name);
  const intentLower = intent.toLowerCase();
  return (
    key === intentLower ||
    nameKey === intentLower ||
    key.endsWith(`/${intentLower}`) ||
    location.rootPath.toLowerCase().includes(`/${intentLower}`)
  );
}

function isLibraryMount(location: StorageLocationInfo): boolean {
  const key = normalizeMountKey(location.rootPath);
  const libraryIntents = [
    "books",
    "audiobooks",
    "movies",
    "tv",
    "music",
    "podcasts",
    "comics",
    "media",
    "library",
    "libraries",
  ];
  return libraryIntents.some(
    (intent) =>
      key === intent ||
      key.endsWith(`/${intent}`) ||
      location.name.toLowerCase().includes(intent),
  );
}

export class ProcessingDestinationResolver {
  resolveModuleDestination(
    moduleId: ProcessingModuleId,
    locations: StorageLocationInfo[],
  ): ResolvedDestination {
    const intent = getDestinationIntent(moduleId);
    const suitable = locations.filter((l) => l.kind !== "read_only");

    if (suitable.length === 0) {
      return {
        intent,
        status: "unresolved",
        displayPath: null,
        storageLocationId: null,
      };
    }

    const matches = suitable.filter((l) => mountMatchesIntent(l, intent));

    if (matches.length === 1) {
      return {
        intent,
        status: "matched",
        displayPath: matches[0]!.rootPath,
        storageLocationId: matches[0]!.id,
      };
    }

    if (matches.length > 1) {
      return {
        intent,
        status: "ambiguous",
        displayPath: null,
        storageLocationId: null,
      };
    }

    const libraryMounts = suitable.filter(isLibraryMount);

    if (libraryMounts.length === 1) {
      const root = libraryMounts[0]!.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
      return {
        intent,
        status: "mono-directory",
        displayPath: path.posix.join(root, intent),
        storageLocationId: libraryMounts[0]!.id,
      };
    }

    if (suitable.length === 1) {
      const root = suitable[0]!.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
      return {
        intent,
        status: "mono-directory",
        displayPath: path.posix.join(root, intent),
        storageLocationId: suitable[0]!.id,
      };
    }

    return {
      intent,
      status: "unresolved",
      displayPath: null,
      storageLocationId: null,
    };
  }

  resolveArchiveDestination(
    intent: ArchiveDestinationIntent,
    locations: StorageLocationInfo[],
  ): ResolvedDestination {
    const matches = locations.filter((l) => mountMatchesIntent(l, intent));
    if (matches.length === 1) {
      return {
        intent,
        status: "matched",
        displayPath: matches[0]!.rootPath,
        storageLocationId: matches[0]!.id,
      };
    }
    if (matches.length > 1) {
      return {
        intent,
        status: "ambiguous",
        displayPath: null,
        storageLocationId: null,
      };
    }
    return {
      intent,
      status: "unresolved",
      displayPath: null,
      storageLocationId: null,
    };
  }
}
