/** Normalize a Hardcover API key to an Authorization header value. */
export function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}
