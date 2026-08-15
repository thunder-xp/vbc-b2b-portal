import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.resolve("supabase/migrations/20260815070609_retail_economy_offer_and_paid_activation.sql"), "utf8");

describe("Retail commercial offer and paid activation migration", () => {
  it("defines one governed fixed equipment-only offer", () => {
    expect(sql).toContain("create table public.retail_commercial_offers");
    expect(sql).toContain("retail_equipment_conversion_offer_v1");
    expect(sql).toContain("discount_value = 10.00");
    expect(sql).toContain("discount_scope = 'equipment'");
    expect(sql).toContain("expires_at = created_at + interval '1 hour'");
    expect(sql).toContain("equipment-discount+materials+installation");
    expect(sql).not.toMatch(/discount.*installation_subtotal|discount.*materials_subtotal/i);
  });

  it("binds, expires, invalidates, and redeems the offer exactly once", () => {
    expect(sql).toContain("retail_commercial_offers_cart_fingerprint_idx");
    expect(sql).toContain("commercial_fingerprint<>p_checkout_fingerprint");
    expect(sql).toContain("commercial_fingerprint_changed");
    expect(sql).toContain("server_ttl_elapsed");
    expect(sql).toContain("status='redeemed',order_id=order_row.id,redeemed_at=now()");
    expect(sql).toContain("order_id uuid null unique");
    expect(sql).toContain("idempotency_key uuid not null unique");
  });

  it("preserves variant and provider preference in the locked order", () => {
    expect(sql).toContain("add column selected_variant");
    expect(sql).toContain("add column installation_selection_mode");
    expect(sql).toContain("add column preferred_installation_provider_id");
    expect(sql).toContain("add column installation_region_code");
    expect(sql).toContain("Retail order orchestration snapshot is immutable.");
    expect(sql).toContain("Selected provider is not eligible.");
  });

  it("does not require an installer for equipment-only checkout", () => {
    expect(sql).toContain("elsif p_installation_selection_mode is not null or p_preferred_provider_id is not null");
    expect(sql).toContain("if orders.installation_selection_mode is null then");
    expect(sql).toContain("'installationRequirementId',null,'assignment',null");
  });

  it("enforces payment before reusing the existing assignment engine", () => {
    const activation = sql.slice(sql.indexOf("create or replace function public.activate_paid_retail_order"));
    expect(activation.indexOf("update public.retail_orders set status='confirmed'")).toBeLessThan(activation.indexOf("insert into public.installation_requirements"));
    expect(activation).toContain("dispatch_result:=public.dispatch_installation_requirement");
    expect(activation).toContain("select * into existing from public.retail_payment_activations");
    expect(activation).toContain("'repeated',true");
    expect(sql).toContain("revoke all on function public.activate_installation_requirement_pilot");
  });

  it("keeps the simulator internal and the normalized activation service-role only", () => {
    expect(sql).toContain("has_internal_permission('admin.retail_marketplace.manage')");
    expect(sql).toContain("return public.activate_paid_retail_order(p_retail_order_id,'pilot_simulated'");
    expect(sql).toContain("grant execute on function public.simulate_retail_order_payment(uuid,uuid,text) to authenticated,service_role");
    expect(sql).toContain("grant execute on function public.activate_paid_retail_order(uuid,text,uuid,text) to service_role");
    expect(sql).not.toMatch(/grant execute on function public\.simulate_retail_order_payment[\s\S]{0,100}to anon/);
  });

  it("returns only bounded public provider presentation from the governed registry", () => {
    const options = sql.slice(sql.indexOf("create or replace function public.retail_installation_checkout_options"), sql.indexOf("create or replace function public.retail_checkout_snapshot_v2"));
    expect(options).toContain("provider.operational_status='active'");
    expect(options).toContain("provider.approval_status='approved'");
    expect(options).toContain("provider.marketplace_enabled");
    expect(options).toContain("competence.system_type='cctv'");
    expect(options).toContain("coalesce(workload.active_jobs,0) < profile.max_concurrent_jobs");
    expect(options).not.toMatch(/compensation|acceptance_score|decline_history|customer_pii/i);
  });

  it("protects append-only history and direct table access", () => {
    expect(sql).toContain("alter table public.retail_commercial_offers enable row level security");
    expect(sql).toContain("alter table public.retail_payment_activations enable row level security");
    expect(sql).toContain("Retail commercial offer history is immutable.");
    expect(sql).toContain("from public, anon, authenticated");
  });
});

describe("Retail installation provider selector hardening", () => {
  const selectorSql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260815115937_exclude_internal_installation_providers_from_public_selector.sql"), "utf8");

  it("keeps internal fallback out of the customer-selectable provider list", () => {
    expect(selectorSql).toContain("provider.provider_type='partner_company'");
    expect(selectorSql).toContain("profile.public_profile_status='published'");
    expect(selectorSql).toContain("provider.marketplace_enabled");
  });
});
