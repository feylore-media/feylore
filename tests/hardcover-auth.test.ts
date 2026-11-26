import { describe, it, expect } from "vitest";
import { normalizeApiKey } from "../src/providers/hardcover/auth.js";

describe("hardcover auth", () => {
  it("prepends Bearer to raw hc_pat token", () => {
    expect(normalizeApiKey("hc_pat_abc123")).toBe("Bearer hc_pat_abc123");
  });

  it("preserves existing Bearer prefix", () => {
    expect(normalizeApiKey("Bearer hc_pat_abc123")).toBe("Bearer hc_pat_abc123");
  });

  it("preserves lowercase bearer prefix", () => {
    expect(normalizeApiKey("bearer hc_pat_abc123")).toBe("bearer hc_pat_abc123");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeApiKey("  hc_pat_abc123  ")).toBe("Bearer hc_pat_abc123");
    expect(normalizeApiKey("  Bearer hc_pat_abc123  ")).toBe(
      "Bearer hc_pat_abc123",
    );
  });

  it("does not double-prefix Bearer tokens", () => {
    const token = "Bearer hc_pat_test";
    expect(normalizeApiKey(token)).toBe(token);
    expect(normalizeApiKey(token)).not.toBe("Bearer Bearer hc_pat_test");
  });
});
