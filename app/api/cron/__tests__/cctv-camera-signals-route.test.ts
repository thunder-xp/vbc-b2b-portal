import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CCTV camera turnover signal schedule", () => {
  it("uses canonical cron authorization and a local bounded projection refresh", () => {
    const route = readFileSync("app/api/cron/cctv-camera-signals/route.ts", "utf8");
    const vercel = readFileSync("vercel.json", "utf8");
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("refresh_cctv_camera_turnover_signals");
    expect(route).not.toContain("1c");
    expect(vercel).toContain('"path": "/api/cron/cctv-camera-signals"');
    expect(vercel).toContain('"schedule": "50 * * * *"');
  });
});
