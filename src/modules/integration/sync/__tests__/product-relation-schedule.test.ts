import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("product relation schedule", () => {
  it("uses the shared cron authorization and a nightly bounded route", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/cron/product-relations/route.ts"), "utf8");
    const schedule = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("createProductRelationSyncService");
    expect(schedule).toContain('"path": "/api/cron/product-relations"');
    expect(schedule).toContain('"schedule": "45 1 * * *"');
  });
});
