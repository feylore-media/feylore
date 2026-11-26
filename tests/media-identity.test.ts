import { describe, expect, it } from "vitest";
import {
  MEDIA_ID_PATTERN,
  createPendingIdentityFields,
  looksLikeMediaId,
  pickAvailableSlug,
  slugifyTitle,
  slugCollisionCandidates,
} from "../src/shared/media-identity.js";
import { generateEntityId } from "../src/server/platform/media-identity/generate-entity-id.js";

describe("generateEntityId", () => {
  it("produces exactly 6 lowercase alphanumeric characters", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateEntityId();
      expect(id).toHaveLength(6);
      expect(id).toMatch(MEDIA_ID_PATTERN);
    }
  });
});

describe("slugifyTitle", () => {
  it("slugifies canonical examples", () => {
    expect(slugifyTitle("The Lightning Thief")).toBe("the-lightning-thief");
    expect(slugifyTitle("The Titan's Curse")).toBe("the-titans-curse");
    expect(slugifyTitle("Café at the End of the World")).toBe(
      "cafe-at-the-end-of-the-world",
    );
  });

  it("returns null for empty or invalid titles", () => {
    expect(slugifyTitle("")).toBeNull();
    expect(slugifyTitle("   ")).toBeNull();
    expect(slugifyTitle("!!!")).toBeNull();
    expect(slugifyTitle("---")).toBeNull();
  });

  it("collapses punctuation and whitespace", () => {
    expect(slugifyTitle("  Hello   World  ")).toBe("hello-world");
    expect(slugifyTitle("Foo & Bar")).toBe("foo-bar");
  });
});

describe("pickAvailableSlug", () => {
  it("allocates collision suffixes deterministically", () => {
    const taken = new Set(["the-lightning-thief"]);
    const slug = pickAvailableSlug("the-lightning-thief", (s) => taken.has(s));
    expect(slug).toBe("the-lightning-thief-2");
  });

  it("allocates -3 when -2 is taken", () => {
    const taken = new Set(["the-lightning-thief", "the-lightning-thief-2"]);
    const slug = pickAvailableSlug("the-lightning-thief", (s) => taken.has(s));
    expect(slug).toBe("the-lightning-thief-3");
  });

  it("avoids canonical slugs that look like media IDs when alternative exists", () => {
    const taken = new Set<string>();
    const slug = pickAvailableSlug("a7k3p9", (s) => taken.has(s));
    expect(slug).toBe("a7k3p9-2");
    expect(looksLikeMediaId("a7k3p9-2")).toBe(false);
  });
});

describe("createPendingIdentityFields", () => {
  it("sets slug equal to id with pending status", () => {
    expect(createPendingIdentityFields("a7k3p9")).toEqual({
      id: "a7k3p9",
      slug: "a7k3p9",
      slugStatus: "pending",
    });
  });
});

describe("slugCollisionCandidates", () => {
  it("yields base then numbered suffixes", () => {
    const candidates = [...slugCollisionCandidates("foo")].slice(0, 4);
    expect(candidates).toEqual(["foo", "foo-2", "foo-3", "foo-4"]);
  });
});
