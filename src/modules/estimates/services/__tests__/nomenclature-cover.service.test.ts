import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { NOMENCLATURE_COVER_MAX_SOURCE_BYTES, NomenclatureCoverError, processNomenclatureCover } from "../nomenclature-cover.service";

describe("nomenclature cover processing", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes and normalizes %s into a bounded WebP", async (format) => {
    const source = sharp({ create: { width: 900, height: 600, channels: 3, background: "#15803d" } });
    const bytes = await source[format]().toBuffer();
    const result = await processNomenclatureCover(new File([bytes], `cover.${format}`, { type: format === "jpeg" ? "image/jpeg" : `image/${format}` }));
    expect(result.width).toBe(512); expect(result.height).toBeLessThanOrEqual(512);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(256 * 1024);
    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
  });
  it("rejects oversized, SVG, spoofed, and malformed images", async () => {
    await expect(processNomenclatureCover(new File([new Uint8Array(NOMENCLATURE_COVER_MAX_SOURCE_BYTES + 1)], "large.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ reason: "size" });
    await expect(processNomenclatureCover(new File(["<svg/>"], "cover.svg", { type: "image/svg+xml" }))).rejects.toMatchObject({ reason: "format" });
    await expect(processNomenclatureCover(new File(["not an image"], "cover.jpg", { type: "image/jpeg" }))).rejects.toBeInstanceOf(NomenclatureCoverError);
  });
});
