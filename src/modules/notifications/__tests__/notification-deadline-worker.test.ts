import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { NotificationDeadlineRepository } from "../repositories";
import {
  businessDate,
  NotificationDeadlineService,
} from "../services";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730132000_partner_notification_deadline_worker.sql",
  ),
  "utf8",
);

describe("notification deadline worker", () => {
  it("uses the canonical Moldova business date", () => {
    expect(businessDate(new Date("2026-07-30T21:30:00Z"))).toBe("2026-07-31");
  });

  it("delegates one bounded server-side generation call", async () => {
    const repository: NotificationDeadlineRepository = {
      generate: vi.fn().mockResolvedValue({
        runId: "00000000-0000-4000-8000-000000000001",
        status: "succeeded",
      }),
    };
    await new NotificationDeadlineService(
      repository,
      () => new Date("2026-07-30T09:00:00Z"),
    ).run();
    expect(repository.generate).toHaveBeenCalledWith("2026-07-30");
  });

  it("generates each deadline from local read models with deterministic versions", () => {
    expect(sql).toContain("history.one_c_delivery_date = p_business_date + 3");
    expect(sql).toContain("history.one_c_delivery_date = p_business_date");
    expect(sql).toContain("history.one_c_delivery_date < p_business_date");
    expect(sql).toContain(
      "concat(candidate.planned_date::text, ':', p_business_date::text)",
    );
    expect(sql).not.toMatch(/standardodata|http_|fetch\s*\(/i);
  });

  it("uses a server-only lock and preserves safe aggregate telemetry", () => {
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("pg_try_advisory_xact_lock");
    expect(sql).toContain("partner_notification_generation_runs");
    expect(sql).not.toContain("safe_payload->>'message'");
  });
});
