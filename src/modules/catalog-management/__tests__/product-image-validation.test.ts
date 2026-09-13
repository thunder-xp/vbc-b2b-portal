import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { validateProductImage } from "../service";

describe("product image validation", () => {
  it("accepts supported content based on decoded bytes and dimensions", async () => {
    const bytes = await sharp({ create: { width: 400, height: 320, channels: 3, background: "white" } }).png().toBuffer();
    const result = await validateProductImage(new File([new Uint8Array(bytes)], "image.anything", { type: "image/png" }));
    expect(result).toMatchObject({ contentType: "image/png", extension: "png", width: 400, height: 320 });
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects extension or declared MIME masquerading as another format", async () => {
    const bytes = await sharp({ create: { width: 400, height: 400, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(validateProductImage(new File([new Uint8Array(bytes)], "fake.png", { type: "image/png" })))
      .rejects.toMatchObject({ safeCode: "CATALOG_IMAGE_TYPE_INVALID" });
  });

  it("rejects corrupt and undersized images", async () => {
    await expect(validateProductImage(new File([new Uint8Array([1, 2, 3])], "bad.png", { type: "image/png" })))
      .rejects.toMatchObject({ safeCode: "CATALOG_IMAGE_CORRUPTED" });
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).webp().toBuffer();
    await expect(validateProductImage(new File([new Uint8Array(tiny)], "tiny.webp", { type: "image/webp" })))
      .rejects.toMatchObject({ safeCode: "CATALOG_IMAGE_DIMENSIONS_INVALID" });
  });
});
