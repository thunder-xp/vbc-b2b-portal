import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("installation assignment worker route", () => {
  it("uses canonical cron authorization and a bounded worker", () => {
    const route = fs.readFileSync(path.resolve("app/api/cron/installation-assignments/route.ts"), "utf8");
    const vercel = fs.readFileSync(path.resolve("vercel.json"), "utf8");
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("runWorker(50)");
    expect(route).toContain("deployedCommitSha");
    expect(vercel).toContain('"/api/cron/installation-assignments"');
    expect(vercel).toContain('"*/5 * * * *"');
  });
});
