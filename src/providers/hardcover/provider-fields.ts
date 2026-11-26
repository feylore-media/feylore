import type { HardcoverBook } from "./types.js";

/** Contract providerFields keys — must match descriptor.providerFields exactly. */
export const HARDCOVER_PROVIDER_FIELD_KEYS = {
  rating: "hardcover.rating",
  bookId: "hardcover.bookId",
  slug: "hardcover.slug",
} as const;

export type HardcoverProviderFieldKey =
  (typeof HARDCOVER_PROVIDER_FIELD_KEYS)[keyof typeof HARDCOVER_PROVIDER_FIELD_KEYS];

export function mapProviderFields(
  book: HardcoverBook,
): Record<string, string | number> {
  const payload: Record<string, string | number> = {};

  if (book.rating != null && book.rating !== "") {
    const rating =
      typeof book.rating === "number"
        ? book.rating
        : Number.parseFloat(String(book.rating));
    if (Number.isFinite(rating)) {
      payload[HARDCOVER_PROVIDER_FIELD_KEYS.rating] = rating;
    }
  }

  if (book.id != null) {
    payload[HARDCOVER_PROVIDER_FIELD_KEYS.bookId] = String(book.id);
  }

  const slug = book.slug?.trim();
  if (slug) {
    payload[HARDCOVER_PROVIDER_FIELD_KEYS.slug] = slug;
  }

  return payload;
}
