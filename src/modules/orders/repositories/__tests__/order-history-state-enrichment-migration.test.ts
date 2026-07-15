import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260715143000_order_history_state_enrichment.sql"),
  "utf8",
);

describe("order history state enrichment migration", () => {
  it("stores the state reference separately without changing the batch RPC signature", () => {
    expect(sql).toContain("add column if not exists one_c_state_ref text null");
    expect(sql).toContain("target_orders jsonb");
    expect(sql).toContain("one_c_state_ref = excluded.one_c_state_ref");
  });

  it("updates the resolved state in place and emits only proven state transitions", () => {
    expect(sql).toContain("on conflict (external_1c_order_ref) do update set");
    expect(sql).toContain("existing_order.one_c_state_code is distinct from saved_order.one_c_state_code");
    expect(sql).toContain("existing_order.one_c_state_raw is distinct from saved_order.one_c_state_raw");
    expect(sql).toContain("'state_changed'");
    expect(sql).toContain("on conflict (fingerprint) do nothing");
  });

  it("keeps synchronization writes restricted to the service role", () => {
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toMatch(/revoke all on function public\.upsert_partner_order_history_batch[\s\S]*authenticated/);
    expect(sql).toMatch(/grant execute on function public\.upsert_partner_order_history_batch[\s\S]*to service_role/);
  });
});
