import {
  normalizeIsbn10,
  normalizeIsbn13,
} from "../../shared/identifier-normalization.js";
import type { HardcoverEdition } from "./types.js";

function editionId(edition: HardcoverEdition): number {
  return edition.id ?? Number.MAX_SAFE_INTEGER;
}

function editionMatchesIsbn13(edition: HardcoverEdition, isbn13: string): boolean {
  if (!edition.isbn_13) return false;
  return normalizeIsbn13(edition.isbn_13) === isbn13;
}

function editionMatchesIsbn10(edition: HardcoverEdition, isbn10: string): boolean {
  if (!edition.isbn_10) return false;
  return normalizeIsbn10(edition.isbn_10) === isbn10;
}

function sortByEditionId(editions: HardcoverEdition[]): HardcoverEdition[] {
  return [...editions].sort((a, b) => editionId(a) - editionId(b));
}

/** Deterministic edition selection; hinted ISBN always wins. */
export function selectEdition(
  editions: HardcoverEdition[],
  hints?: Record<string, unknown>,
): HardcoverEdition | undefined {
  if (editions.length === 0) return undefined;
  if (editions.length === 1) return editions[0];

  const sorted = sortByEditionId(editions);

  const isbn13Hint =
    typeof hints?.isbn13 === "string"
      ? normalizeIsbn13(hints.isbn13)
      : undefined;
  if (isbn13Hint) {
    const match = sorted.find((edition) =>
      editionMatchesIsbn13(edition, isbn13Hint),
    );
    if (match) return match;
  }

  const isbn10Hint =
    typeof hints?.isbn10 === "string"
      ? normalizeIsbn10(hints.isbn10)
      : undefined;
  if (isbn10Hint) {
    const match = sorted.find((edition) =>
      editionMatchesIsbn10(edition, isbn10Hint),
    );
    if (match) return match;
  }

  const isbnHint =
    typeof hints?.isbn === "string" ? hints.isbn.replace(/[-\s]/g, "") : undefined;
  if (isbnHint) {
    const asIsbn13 = normalizeIsbn13(isbnHint);
    if (asIsbn13) {
      const match = sorted.find((edition) =>
        editionMatchesIsbn13(edition, asIsbn13),
      );
      if (match) return match;
    }
    const asIsbn10 = normalizeIsbn10(isbnHint);
    if (asIsbn10) {
      const match = sorted.find((edition) =>
        editionMatchesIsbn10(edition, asIsbn10),
      );
      if (match) return match;
    }
  }

  return sorted[0];
}
