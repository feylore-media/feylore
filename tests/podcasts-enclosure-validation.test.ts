import { describe, it, expect } from "vitest";
import {
  MIN_ENCLOSURE_BYTES,
  validateEnclosureAudio,
} from "../src/server/modules/podcasts/enclosure-validation.js";

describe("validateEnclosureAudio", () => {
  it("rejects tiny placeholder buffers", async () => {
    await expect(
      validateEnclosureAudio(Buffer.alloc(512), "audio/mpeg"),
    ).rejects.toThrow(/too small/i);
    expect(MIN_ENCLOSURE_BYTES).toBeGreaterThan(512);
  });

  it("rejects buffers with no audio magic bytes", async () => {
    const data = Buffer.alloc(2048, 0);
    await expect(validateEnclosureAudio(data, "audio/mpeg")).rejects.toThrow(
      /valid audio/i,
    );
  });
});
