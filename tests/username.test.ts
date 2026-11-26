import { describe, it, expect } from "vitest";
import {
  extractMentionUsernames,
  sanitizeUsernameCandidate,
  validateUsername,
  usernameSchema,
} from "../src/shared/username.js";

describe("username", () => {
  it("sanitizes OIDC candidates", () => {
    expect(sanitizeUsernameCandidate("Allie Smith")).toBe("allie-smith");
  });

  it("rejects reserved usernames", () => {
    expect(validateUsername("admin")).toBe("Username is reserved");
    expect(validateUsername("settings")).toBe("Username is reserved");
  });

  it("accepts valid usernames", () => {
    expect(validateUsername("allie")).toBeNull();
    expect(validateUsername("a.b_c-2")).toBeNull();
  });

  it("parses and normalizes via schema", () => {
    expect(usernameSchema.parse("Allie")).toBe("allie");
  });

  it("extracts mention usernames", () => {
    expect(extractMentionUsernames("Hi @allie and @bob.x")).toEqual([
      "allie",
      "bob.x",
    ]);
  });
});
