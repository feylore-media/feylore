export function toAbsoluteApiUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return new URL(url, window.location.origin).href;
  }
  return new URL(url, window.location.href).href;
}

export function isAuthenticatedFileContentUrl(url: string): boolean {
  if (typeof window === "undefined") {
    return /^\/api\/v1\/files\/[^/]+\/content$/.test(url);
  }
  try {
    const parsed = new URL(toAbsoluteApiUrl(url));
    return (
      parsed.origin === window.location.origin &&
      /^\/api\/v1\/files\/[^/]+\/content$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}
