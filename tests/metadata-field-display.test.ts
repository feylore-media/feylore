import { describe, expect, it } from "vitest";
import { metadataFieldsForOverview } from "../src/web/components/books/metadata/metadata-field-display.js";
import type { BookMetadataField } from "../src/shared/books.js";

function field(id: string, group = "identity"): BookMetadataField {
  return {
    id,
    label: id,
    value: "value",
    group,
    prominence: "primary",
  };
}

describe("metadataFieldsForOverview", () => {
  it("excludes title, subtitle, and description from overview metadata grids", () => {
    const fields = [
      field("title"),
      field("subtitle"),
      field("description", "content"),
      field("authors"),
      field("isbn13"),
    ];

    const overview = metadataFieldsForOverview(fields);
    expect(overview.map((f) => f.id)).toEqual(["authors", "isbn13"]);
  });
});
