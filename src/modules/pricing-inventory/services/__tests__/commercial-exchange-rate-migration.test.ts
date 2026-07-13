import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260713080000_commercial_exchange_rate_read_model.sql"),
  "utf8",
);

describe("commercial exchange-rate read model migration", () => {
  it("keeps rates read-only for partner sessions and requires RLS", () => {
    expect(sql).toContain("alter table public.commercial_exchange_rates enable row level security");
    expect(sql).toContain("grant select on table public.commercial_exchange_rates to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all).*authenticated/i);
    expect(sql).toContain("p.code = 'prices.view'");
  });

  it("stores only normalized positive quote-per-base rates without seed data", () => {
    expect(sql).toContain("rate_direction = 'quote_per_base'");
    expect(sql).toContain("check (rate > 0)");
    expect(sql).not.toMatch(/insert\s+into\s+public\.commercial_exchange_rates/i);
  });
});
