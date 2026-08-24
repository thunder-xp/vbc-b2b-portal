import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("catalog image normalization schedule", () => {
  it("uses the shared cron authorization and bounded worker", () => {
    const route = readFileSync("app/api/cron/catalog-image-normalization/route.ts", "utf8");
    const vercel = readFileSync("vercel.json", "utf8");
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("processCatalogProductImageNormalizationBatch(12)");
    expect(vercel).toContain('"path": "/api/cron/catalog-image-normalization"');
  });
});
