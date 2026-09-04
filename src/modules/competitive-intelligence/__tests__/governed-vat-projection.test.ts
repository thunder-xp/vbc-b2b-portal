import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260904163014_governed_price_type_vat_projection.sql"),
  "utf8",
);
const comparator = migration.slice(
  migration.indexOf("create or replace function private.evaluate_competitive_price_comparison"),
  migration.indexOf("create or replace function private.govern_private_competitor_observation_comparison"),
);
const productRead = migration.slice(
  migration.indexOf("create or replace function public.get_partner_product_competitor_pricing"),
);

describe("governed competitive VAT projection", () => {
  it("keeps the authoritative nullable VAT basis on price types, not product prices", () => {
    expect(migration).toContain("alter table public.price_types");
    expect(migration).toContain("add column vat_included boolean");
    expect(migration).toContain("vat_basis_synced_at");
    expect(migration).not.toMatch(/alter table public\.product_prices[\s\S]*vat_included/);
    expect(migration).toContain("vat_included = excluded.vat_included");
  });

  it("starts existing price types and private observations fail-closed", () => {
    expect(migration).toContain("add column vat_included boolean");
    expect(migration).toContain("vat_semantics text not null default 'legacy_unknown'");
    expect(migration).toContain("when own.vat_semantics in ('user_attested','policy_assigned')");
    expect(migration).toContain("else 'unknown'");
  });

  it("uses one deterministic fail-closed comparator for all required reasons", () => {
    for (const reason of [
      "private_observation_not_authorized",
      "price_unavailable",
      "stale_novotech_price",
      "stale_competitor_price",
      "currency_mismatch",
      "vat_unknown",
      "vat_mismatch",
      "incompatible_price_basis",
      "comparable",
    ]) expect(comparator).toContain(`'${reason}'`);
    expect(migration.match(/create or replace function private\.evaluate_competitive_price_comparison/g)).toHaveLength(1);
  });

  it("allows equal INCLUDED and EXCLUDED bases but blocks unknown, mismatch, stale, and currency mismatch", () => {
    expect(comparator).toContain("p_competitor_vat_basis not in ('included','excluded')");
    expect(comparator).toContain("p_competitor_vat_basis <> p_novotech_vat_basis");
    expect(comparator).toContain("upper(btrim(p_competitor_currency)) <> upper(btrim(p_novotech_currency))");
    expect(comparator).toContain("not coalesce(p_novotech_fresh, false)");
    expect(comparator).toContain("not coalesce(p_competitor_fresh, false)");
  });

  it("contains no FX or VAT normalization and performs one bounded Novotech price lookup", () => {
    expect(productRead).not.toMatch(/commercial_exchange_rates|partnerUsdMdl|retailUsdMdl|\*\s*(?:1\.2|20)|\/\s*(?:1\.2|20)/i);
    expect(productRead.match(/join public\.product_prices price/g)).toHaveLength(1);
    expect(productRead).toContain("from public.current_competitor_retail_prices current");
    expect(productRead).toContain("observation.partner_company_id = p_company_id");
  });

  it("makes new private INCLUDED policy explicit and server-enforced", () => {
    expect(migration).toContain("if new.vat_mode <> 'included'");
    expect(migration).toContain("new.vat_semantics := 'policy_assigned'");
    expect(migration).toContain("new.vat_mode := 'included'");
  });

  it("keeps shared retail observations VAT INCLUDED by the existing table contract", () => {
    const shared = readFileSync(
      resolve("supabase/migrations/20260825175319_central_competitor_retail_pricing.sql"),
      "utf8",
    );
    expect(shared).toContain("VAT is included by contract");
    expect(migration).not.toMatch(/update public\.competitor_retail_price_observations/i);
  });

  it("preserves RLS/RPC authorization and denies anonymous comparison reads", () => {
    expect(productRead).toContain("public.can_access_competitive_intelligence");
    expect(productRead).toContain("revoke all on function public.get_partner_product_competitor_pricing(uuid,uuid)");
    expect(productRead).toContain("from public, anon");
  });
});
