import { downloadManager } from "./manager.js";

export class OfflineUnavailableError extends Error {
  constructor(message = "offline_unavailable") {
    super(message);
    this.name = "OfflineUnavailableError";
  }
}

export async function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const absolute = url.startsWith("http")
    ? url
    : new URL(url, window.location.origin).href;

  if (navigator.onLine) {
    const response = await fetch(input, {
      ...init,
      credentials: init?.credentials ?? "include",
    });
    if (response.ok && isPublicationUrl(url)) {
      const cache = await caches.open("feylore-downloads");
      await cache.put(absolute, response.clone());
    }
    return response;
  }

  const cached = await downloadManager.getCachedResponse(url);
  if (cached) return cached;

  throw new OfflineUnavailableError();
}

function isPublicationUrl(url: string): boolean {
  return (
    url.includes("/publication/manifest") ||
    url.includes("/publication/resource")
  );
}

export async function isManifestCached(manifestUrl: string): Promise<boolean> {
  return downloadManager.hasCachedUrl(manifestUrl);
}
