import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COMMERCIAL_SYNC_SCHEDULES } from "@/src/modules/integration/sync/commercial-sync-schedule";

type CronEntry = { path: string; schedule: string };

const configuration = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as { crons: CronEntry[] };

describe("commercial synchronization schedule", () => {
  it("registers rates, prices, stock with arrivals, and catalog as independent daily starts", () => {
    for (const job of Object.values(COMMERCIAL_SYNC_SCHEDULES)) {
      expect(configuration.crons).toContainEqual({
        path: job.path,
        schedule: job.cron,
      });
      expect(job.cron.split(" ").slice(2)).toEqual(["*", "*", "*"]);
    }
  });

  it("runs rates before prices before stock and avoids simultaneous starts", () => {
    const starts = Object.values(COMMERCIAL_SYNC_SCHEDULES).map((job) => utcMinute(job.cron));
    expect(new Set(starts).size).toBe(starts.length);
    expect(minutesBetween(starts[0]!, starts[1]!)).toBeGreaterThanOrEqual(60);
    expect(minutesBetween(starts[1]!, starts[2]!)).toBeGreaterThanOrEqual(60);
  });

  it("keeps resumable workers separate from daily start schedules", () => {
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/price-sync-resume",
      schedule: "* * * * *",
    });
    expect(configuration.crons).toContainEqual({
      path: "/api/cron/stock-sync-resume",
      schedule: "* * * * *",
    });
  });
});

function utcMinute(cron: string): number {
  const [minute, hour] = cron.split(" ").map(Number);
  return hour! * 60 + minute!;
}

function minutesBetween(left: number, right: number): number {
  return (right - left + 24 * 60) % (24 * 60);
}
