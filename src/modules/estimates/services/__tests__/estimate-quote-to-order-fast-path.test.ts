import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260926140000_partner_quote_to_order_fast_path.sql",
), "utf8");
const revokeSql = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260926141000_revoke_legacy_estimate_cart_transfer.sql",
), "utf8");

describe("accepted Estimate quote-to-order database boundary", () => {
  it("binds one idempotent cart transfer to the immutable accepted version", () => {
    expect(sql).toContain("transfer_accepted_estimate_to_cart_v3");
    expect(sql).toContain("target_estimate.accepted_version_id is distinct from target_version.id");
    expect(sql).toContain("target_version.status <> 'accepted'");
    expect(sql).toContain("target_estimate.revision <> expected_estimate_revision");
    expect(sql).toContain("target_version.estimate_revision <> expected_estimate_revision");
    expect(sql).toContain("estimate_cart_conversions_one_per_version_idx");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("derives allowed product identity and quantity from the stored version snapshot", () => {
    expect(sql).toContain("jsonb_array_elements(target_version.snapshot -> 'items')");
    expect(sql).toContain("item ->> 'id' = row.line_id::text");
    expect(sql).toContain("item ->> 'product_id' = row.product_id::text");
    expect(sql).toContain("row.requested_quantity <> (accepted.item ->> 'quantity')::numeric");
  });

  it("reuses the canonical cart and unmet-demand mutation and preserves version linkage", () => {
    expect(sql).toContain("public.transfer_estimate_to_cart_v2");
    expect(sql).toContain("set version_id = target_version.id");
    expect(sql).toContain("grant execute on function public.transfer_accepted_estimate_to_cart_v3");
    expect(sql).toContain("set search_path = ''");
    expect(revokeSql).toContain("revoke all on function public.transfer_estimate_to_cart_v2(uuid, uuid, jsonb)");
    expect(revokeSql).toContain("from public, anon, authenticated");
  });
});
