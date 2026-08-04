import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/internal/product-mapping-audit/route.ts", "utf8").replace(/\r\n/g, "\n");

describe("product mapping audit route", () => {
  it("requires canonical cron authorization and accepts only bounded pagination", () => {
    expect(source).toContain("PRODUCT_MAPPING_AUDIT_SECRET");
    expect(source).toContain("timingSafeEqual(expectedBytes, suppliedBytes)");
    expect(source).toContain("authorizeCronRequest(request)");
    expect(source).toContain("boundedInteger(url.searchParams.get(\"offset\")");
    expect(source).toContain("boundedInteger(url.searchParams.get(\"limit\")");
  });
  it("does not accept browser-supplied product references", () => {
    expect(source).not.toContain("searchParams.get(\"reference\")");
    expect(source).not.toContain("searchParams.get(\"productId\")");
  });
});
