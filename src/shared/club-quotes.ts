import type { ReadingLocator } from "./books.js";

export function quoteTextFromAnnotation(annotation: {
  highlightText: string | null;
  note: string | null;
}): string | null {
  const highlight = annotation.highlightText?.trim();
  const note = annotation.note?.trim();
  if (highlight && note) return `${highlight}\n\n— ${note}`;
  return highlight ?? note ?? null;
}

export function isShareableQuoteAnnotation(annotation: {
  highlightText: string | null;
  note: string | null;
}): boolean {
  return quoteTextFromAnnotation(annotation) !== null;
}

export type ClubQuoteLocator = Pick<
  ReadingLocator,
  "title" | "href" | "progression" | "totalProgression"
>;
