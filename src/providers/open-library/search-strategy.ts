export type OpenLibrarySearchPlan =
  | { type: "isbn"; isbn: string }
  | { type: "title"; title: string; author?: string };

export function buildSearchPlan(
  hints: Record<string, unknown> | undefined,
  matchingRules?: { preferIsbnMatching?: boolean },
): OpenLibrarySearchPlan | null {
  if (!hints) return null;

  const preferIsbn = matchingRules?.preferIsbnMatching ?? true;

  const isbnRaw =
    preferIsbn &&
    (typeof hints.isbn13 === "string"
      ? hints.isbn13
      : typeof hints.isbn === "string"
        ? hints.isbn
        : undefined);

  if (isbnRaw) {
    const isbn = isbnRaw.replace(/[-\s]/g, "");
    if (isbn.length >= 10) {
      return { type: "isbn", isbn };
    }
  }

  const title = typeof hints.title === "string" ? hints.title.trim() : "";
  if (!title) return null;

  const author =
    typeof hints.author === "string" ? hints.author.trim() : undefined;

  return { type: "title", title, author: author || undefined };
}
