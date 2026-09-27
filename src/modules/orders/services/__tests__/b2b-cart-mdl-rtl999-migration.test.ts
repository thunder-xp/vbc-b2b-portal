import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260927150000_b2b_cart_mdl_rtl999_1c_local_time.sql",
), "utf8");

describe("B2B cart MDL and RTL 999 migration", () => {
  it("keeps historical rows untouched while requiring complete evidence on new v5 snapshots", () => {
    expect(sql).toContain("source_unit_price is null");
    expect(sql).toContain("source_currency_code is null");
    expect(sql).toContain("source_currency_code in ('USD', 'MDL')");
    expect(sql).toContain("exchange_rate_purpose = 'retail_price_usd_to_mdl'");
    expect(sql).toContain("partner_unit_price = round(source_unit_price * applied_exchange_rate, 0)");
    expect(sql).not.toMatch(/update\s+public\.partner_order_items/i);
  });

  it("validates MDL payload totals and the active immutable RTL 999 version", () => {
    expect(sql).toContain("resolved_document_currency_code <> 'MDL'");
    expect(sql).toContain("upper(btrim(coalesce(target_payload->>'currency', ''))) <> 'MDL'");
    expect(sql).toContain("rate.purpose <> 'retail_price_usd_to_mdl'");
    expect(sql).toContain("not rate.is_active or not rate.is_published");
    expect(sql).toContain("mdl_payload_consistency_validation");
  });

  it("keeps privileged functions bounded to authenticated callers with fixed search_path", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on function public.validate_partner_order_submission_v5");
    expect(sql).toContain("revoke all on function public.begin_partner_order_submission_v5");
    expect(sql).toContain("grant execute on function public.validate_partner_order_submission_v5");
    expect(sql).toContain("grant execute on function public.begin_partner_order_submission_v5");
  });
});
