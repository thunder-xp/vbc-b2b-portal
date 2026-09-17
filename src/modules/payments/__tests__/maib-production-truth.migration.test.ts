import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260917181520_maib_production_payment_truth_projection.sql"), "utf8").toLowerCase();

describe("MAIB production payment truth projection", () => {
  it("keeps payment data service-role-only behind FORCE RLS", () => {
    expect(sql).toContain("alter table public.retail_payment_attempts force row level security");
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).toContain("revoke all on public.retail_payment_current_states_v1");
    expect(sql).toContain("grant select on public.retail_payment_current_states_v1 to service_role");
    expect(sql).not.toContain("grant select on public.retail_payment_current_states_v1 to authenticated");
  });

  it("preserves historical paid attempts while projecting confirmed full refunds truthfully", () => {
    expect(sql).toContain("when refund.status = 'refunded' then 'refunded'");
    expect(sql).toContain("when refund.status = 'refunded' then 0::numeric(14,2)");
    expect(sql).not.toContain("update public.retail_payment_attempts");
    expect(sql).not.toContain("update public.retail_orders");
  });

  it("returns refund states from the existing service-only return boundary", () => {
    expect(sql).toContain("current_state.payment_state = 'refunded'");
    expect(sql).toContain("current_state.payment_state = 'refund_pending'");
    expect(sql).toContain("grant execute on function public.get_retail_payment_return_state_v1(uuid)\nto service_role");
  });
});
