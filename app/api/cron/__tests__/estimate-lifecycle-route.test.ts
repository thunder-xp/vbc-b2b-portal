import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cron/estimate-lifecycle/route.ts", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };

describe("estimate lifecycle expiration route", () => {
  it("uses shared authorization and a bounded no-store worker", () => {
    expect(route).toContain("authorizeCronRequest(request)");
    expect(route).toContain('rpc("expire_estimate_lifecycles"');
    expect(route).toContain("target_limit: 100");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(vercel.crons).toContainEqual({ path: "/api/cron/estimate-lifecycle", schedule: "*/15 * * * *" });
  });
});
