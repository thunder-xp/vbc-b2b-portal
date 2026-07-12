import { describe, expect, it } from "vitest";
import { CATALOG_SYNC_CRON, CATALOG_SYNC_INTERVAL_HOURS } from "../catalog-schedule";

describe("catalog schedule", () => {
  it("runs once every 24 hours at 02:00", () => {
    expect(CATALOG_SYNC_INTERVAL_HOURS).toBe(24);
    expect(CATALOG_SYNC_CRON).toBe("0 2 * * *");
  });
});
