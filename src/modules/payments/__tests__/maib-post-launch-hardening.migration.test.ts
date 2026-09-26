import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925210000_maib_public_checkout_post_launch_hardening.sql"), "utf8").toLowerCase();
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };

describe("MAIB public checkout post-launch hardening", () => {
  it("claims only bounded public attempts with a recoverable lease", () => {
    expect(sql).toContain("p_limit not between 1 and 5");
    expect(sql).toContain("orders.checkout_channel = 'public'");
    expect(sql).toContain("for update of attempt skip locked");
    expect(sql).toContain("interval '2 minutes'");
    expect(sql).toContain("status in ('pending', 'paid_pending_activation')");
  });

  it("terminalizes unpaid attempts only from explicit provider terminal states", () => {
    expect(sql).toContain("p_outcome not in ('pending', 'expired', 'abandoned', 'cancelled', 'failed')");
    expect(sql).toContain("when p_outcome in ('expired', 'abandoned') then 'expired'");
    expect(sql).toContain("'maib_checkout_' || p_outcome");
    expect(sql).not.toContain("update public.retail_orders\n  set status");
    expect(sql).not.toContain("activate_paid_retail_order");
  });

  it("uses bounded backoff and exposes safe operational evidence to service role only", () => {
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain("interval '1 hour'");
    expect(sql).toContain("last_provider_outcome");
    expect(sql).toContain("last_payment_event_type");
    expect(sql).toContain("grant select on public.retail_payment_current_states_v1 to service_role");
    expect(sql).not.toContain("grant select on public.retail_payment_current_states_v1 to authenticated");
  });

  it("schedules one small batch every five minutes", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/retail-payment-reconciliation", schedule: "*/5 * * * *" });
  });
});
