const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Strip HTML and unsafe URL schemes from RSS or user-facing text. */
export function plainTextFromHtml(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  let text = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+);/gi, (_, entity: string) => ENTITY_MAP[entity.toLowerCase()] ?? " ")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number.parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
    })
    .replace(/file:\/\/\/?[^\s]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}
