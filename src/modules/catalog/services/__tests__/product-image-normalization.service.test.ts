import { readFileSync } from "node:fs";

import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { normalizeCatalogProductImage } from "../product-image-normalization.service";

describe("catalog product image normalization", () => {
  it("normalizes a whitespace-heavy image to a bounded square WebP", async () => {
    const input = await fixture(800, 600, { left: 280, top: 180, width: 240, height: 240 });
    const result = await normalizeCatalogProductImage(input);
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(await sharp(result.bytes).metadata()).toMatchObject({ width: 512, height: 512, format: "webp" });
    expect(result.metadata.sourceOccupancyPermille).toBeLessThan(300);
  });

  it("preserves a long subject aspect ratio without stretching", async () => {
    const input = await fixture(900, 300, { left: 50, top: 100, width: 800, height: 100 });
    const result = await normalizeCatalogProductImage(input);
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = opaqueBounds(data, info.width, info.height, info.channels);
    expect(bounds.width / bounds.height).toBeGreaterThan(6);
  });

  it("normalizes a tightly composed image with a safe background edge", async () => {
    const input = await fixture(400, 400, { left: 8, top: 8, width: 384, height: 384 });
    expect((await normalizeCatalogProductImage(input)).status).toBe("normalized");
  });

  it("does not crop a white camera body enclosed by a dark outline", async () => {
    const input = await sharp({ create: { width: 600, height: 600, channels: 4, background: "white" } })
      .composite([
        { input: await sharp({ create: { width: 260, height: 220, channels: 4, background: "#222" } }).png().toBuffer(), left: 170, top: 190 },
        { input: await sharp({ create: { width: 240, height: 200, channels: 4, background: "#fdfdfd" } }).png().toBuffer(), left: 180, top: 200 },
      ]).png().toBuffer();
    expect((await normalizeCatalogProductImage(input)).status).toBe("normalized");
  });

  it("supports transparent PNG input", async () => {
    const input = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 200, height: 300, channels: 4, background: "#333" } }).png().toBuffer(), left: 200, top: 150 }])
      .png().toBuffer();
    expect((await normalizeCatalogProductImage(input)).status).toBe("normalized");
  });

  it("preserves low-confidence photographic backgrounds for review", async () => {
    const input = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#3578a8" } }).jpeg().toBuffer();
    expect(await normalizeCatalogProductImage(input)).toMatchObject({ status: "review_needed", reason: "background_confidence_low" });
  });

  it("keeps processing out of catalog request and React paths", () => {
    const migration = readFileSync("supabase/migrations/20260824091423_catalog_image_normalization_pipeline.sql", "utf8");
    const cron = readFileSync("app/api/cron/catalog-image-normalization/route.ts", "utf8");
    expect(migration).toContain("for update skip locked");
    expect(cron).toContain("authorizeCronRequest");
    expect(cron).toContain("processCatalogProductImageNormalizationBatch(12)");
  });
});

async function fixture(width: number, height: number, subject: { left: number; top: number; width: number; height: number }) {
  const shape = await sharp({ create: { width: subject.width, height: subject.height, channels: 4, background: "#222" } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: "white" } })
    .composite([{ input: shape, left: subject.left, top: subject.top }]).png().toBuffer();
}

function opaqueBounds(data: Buffer, width: number, height: number, channels: number) {
  let left = width; let right = -1; let top = height; let bottom = -1;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    if (data[offset + 3]! < 32 || (data[offset]! > 242 && data[offset + 1]! > 242 && data[offset + 2]! > 242)) continue;
    const x = index % width; const y = Math.floor(index / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { width: right - left + 1, height: bottom - top + 1 };
}
