import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260801120000_order_price_freshness_recovery.sql"),
  "utf8",
);

describe("order price freshness recovery migration", () => {
  it("keeps leases and publication service-role-only", () => {
    expect(sql).toMatch(/alter table public\.order_price_refresh_leases enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.order_price_refresh_leases from public, anon, authenticated/i);
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/i);
    expect(sql).not.toMatch(/grant (select|insert|update|delete).*authenticated/i);
  });

  it("publishes only a bounded complete verified set atomically", () => {
    expect(sql).toMatch(/jsonb_array_length\(p_rows\) not between 1 and 100/i);
    expect(sql).toMatch(/on conflict \(product_id, external_1c_price_type_id\) do update/i);
    expect(sql).toMatch(/if published_count <> expected_count then/i);
    expect(sql).toMatch(/raise exception 'ORDER_PRICE_REFRESH_INCOMPLETE'/i);
  });

  it("skips opportunity fan-out for timestamp-only price refreshes", () => {
    expect(sql).toMatch(/tg_table_name = 'product_prices' and tg_op = 'UPDATE'/i);
    expect(sql).toMatch(/old\.price_amount[\s\S]*is not distinct from[\s\S]*new\.price_amount/i);
    expect(sql).toMatch(/return null;/i);
  });
});
