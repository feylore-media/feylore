import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/server/config.js";

describe("production configuration", () => {
  const base = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/feylore",
  };

  it("rejects the development secret and short secrets", () => {
    expect(() => loadConfig(base)).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadConfig({ ...base, SESSION_SECRET: "short-but-16-chars" }),
    ).toThrow(/SESSION_SECRET/);
  });

  it("accepts an explicitly configured production secret", () => {
    expect(
      loadConfig({
        ...base,
        SESSION_SECRET: "a-unique-secret-at-least-32-characters",
      }).NODE_ENV,
    ).toBe("production");
  });
});
