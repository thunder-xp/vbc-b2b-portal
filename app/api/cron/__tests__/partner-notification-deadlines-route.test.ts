import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/cron/partner-notification-deadlines/route.ts",
  ),
  "utf8",
);
const vercel = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as { crons: Array<{ path: string; schedule: string }> };

describe("partner notification deadline cron", () => {
  it("uses canonical cron authorization and no-store responses", () => {
    expect(route).toContain("await authorizeCronRequest(request)");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("runs once daily in the morning operational window", () => {
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/partner-notification-deadlines",
      schedule: "10 5 * * *",
    });
  });
});
