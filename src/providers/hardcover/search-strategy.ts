import {
  normalizeIsbn10,
  normalizeIsbn13,
} from "../../shared/identifier-normalization.js";

export type HardcoverSearchPlan =
  | { type: "isbn13"; isbn: string }
  | { type: "isbn10"; isbn: string }
  | { type: "title"; title: string; author?: string };

export function buildSearchPlan(
  hints: Record<string, unknown> | undefined,
  matchingRules?: { preferIsbnMatching?: boolean },
): HardcoverSearchPlan | null {
  if (!hints) return null;

  const preferIsbn = matchingRules?.preferIsbnMatching ?? true;

  if (preferIsbn) {
    const isbn13Raw =
      typeof hints.isbn13 === "string" ? hints.isbn13 : undefined;
    if (isbn13Raw) {
      const isbn13 = normalizeIsbn13(isbn13Raw);
      if (isbn13) return { type: "isbn13", isbn: isbn13 };
    }

    const isbn10Raw =
      typeof hints.isbn10 === "string" ? hints.isbn10 : undefined;
    if (isbn10Raw) {
      const isbn10 = normalizeIsbn10(isbn10Raw);
      if (isbn10) return { type: "isbn10", isbn: isbn10 };
    }

    const isbnRaw = typeof hints.isbn === "string" ? hints.isbn : undefined;
    if (isbnRaw) {
      const isbn13 = normalizeIsbn13(isbnRaw);
      if (isbn13) return { type: "isbn13", isbn: isbn13 };
      const isbn10 = normalizeIsbn10(isbnRaw);
      if (isbn10) return { type: "isbn10", isbn: isbn10 };
    }
  }

  const title = typeof hints.title === "string" ? hints.title.trim() : "";
  if (!title) return null;

  const author =
    typeof hints.author === "string" ? hints.author.trim() : undefined;

  return { type: "title", title, author: author || undefined };
}
