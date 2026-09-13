import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("external-price worker cost governance", () => {
  it("uses upload-driven execution with a five-minute recovery watchdog", () => {
    const schedule = JSON.parse(source("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    expect(schedule.crons.find((cron) => cron.path === "/api/cron/external-price-imports")?.schedule).toBe("*/5 * * * *");
    expect(source("src/modules/external-prices/actions.ts")).toContain("after(processExternalPriceImportAfterUpload)");
    expect(source("src/modules/competitive-intelligence/retail-pricing.actions.ts")).toContain("after(processExternalPriceImportAfterUpload)");
    expect(source("src/modules/external-prices/import-worker.ts")).toContain('result.status !== "idle"');
  });

  it("does not alter price, stock, warranty, or recovery schedules", () => {
    const schedule = JSON.parse(source("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    const byPath = new Map(schedule.crons.map((cron) => [cron.path, cron.schedule]));
    expect(byPath.get("/api/cron/price-sync-resume")).toBe("* * * * *");
    expect(byPath.get("/api/cron/stock-sync-resume")).toBe("* * * * *");
    expect(byPath.get("/api/cron/warranty-serials")).toBe("*/2 * * * *");
    expect(byPath.get("/api/cron/order-reconciliation")).toBe("*/2 * * * *");
  });
});

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
