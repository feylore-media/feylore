import type { BookIdentifierEntry } from "./book-metadata-field-kinds.js";

export function normalizeIsbnDigits(value: string): string {
  return value.replace(/[-\s]/g, "");
}

export function normalizeIsbn10(value: string): string | null {
  const digits = normalizeIsbnDigits(value);
  if (!/^\d{9}[\dXx]$/.test(digits)) return null;
  return digits.toUpperCase();
}

export function normalizeIsbn13(value: string): string | null {
  const digits = normalizeIsbnDigits(value);
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  return digits;
}

export function classifyIdentifier(
  entry: BookIdentifierEntry,
): "isbn10" | "isbn13" | "asin" | null {
  const scheme = entry.scheme?.toLowerCase() ?? "";
  const digits = normalizeIsbnDigits(entry.value);
  if (scheme.includes("isbn")) {
    if (digits.length === 13) return "isbn13";
    if (digits.length === 10) return "isbn10";
  }
  if (/^97[89]\d{10}$/.test(digits)) return "isbn13";
  if (/^\d{9}[\dXx]$/.test(digits)) return "isbn10";
  if (scheme.includes("asin") || /^B[\dA-Z]{9}$/i.test(entry.value.trim())) {
    return "asin";
  }
  return null;
}

export function normalizeIdentifierCollection(
  identifiers: BookIdentifierEntry[],
): BookIdentifierEntry[] {
  return identifiers
    .map((entry) => {
      const kind = classifyIdentifier(entry);
      if (kind === "isbn10") {
        const normalized = normalizeIsbn10(entry.value);
        return normalized ? { ...entry, value: normalized } : entry;
      }
      if (kind === "isbn13") {
        const normalized = normalizeIsbn13(entry.value);
        return normalized ? { ...entry, value: normalized } : entry;
      }
      return entry;
    })
    .filter((entry) => entry.value.trim().length > 0);
}

export function promotedIdentifiersFromCollection(
  identifiers: BookIdentifierEntry[],
): { isbn10?: string; isbn13?: string; asin?: string } {
  const result: { isbn10?: string; isbn13?: string; asin?: string } = {};
  for (const entry of identifiers) {
    const kind = classifyIdentifier(entry);
    if (kind === "isbn10" && !result.isbn10) {
      result.isbn10 = normalizeIsbn10(entry.value) ?? entry.value;
    } else if (kind === "isbn13" && !result.isbn13) {
      result.isbn13 = normalizeIsbn13(entry.value) ?? entry.value;
    } else if (kind === "asin" && !result.asin) {
      result.asin = entry.value.trim();
    }
  }
  return result;
}
