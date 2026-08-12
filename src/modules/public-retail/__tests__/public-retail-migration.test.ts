import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260812120000_public_retail_projection.sql"),
  "utf8",
);
const readRepository = readFileSync(
  join(process.cwd(), "src/modules/public-retail/repositories/supabase/public-retail.supabase-repository.ts"),
  "utf8",
);
const publicClient = readFileSync(
  join(process.cwd(), "src/lib/supabase/public.ts"),
  "utf8",
);

describe("Public Retail migration contract", () => {
  it("publishes only active visible products with canonical RETAIL pricing", () => {
    expect(migration).toContain("product.is_active and product.is_visible");
    expect(migration).toContain("price_type.external_code = 'UU-000020'");
    expect(migration).toContain("join lateral (");
    expect(migration).toContain("price.company_id is null");
    expect(migration).not.toContain("d9c522b0-046a-4ad9-90ea-62f9777ce309");
  });

  it("uses conservative public availability without exposing exact stock", () => {
    expect(migration).toContain("when stock.freshness_state is distinct from 'authoritative' then 'unknown'");
    expect(migration).toContain("when stock.available_quantity > 5 then 'in_stock'");
    const publicReads = migration.slice(migration.indexOf("create or replace function public.list_public_retail_categories"));
    expect(publicReads).not.toContain("available_quantity");
    expect(publicReads).not.toContain("warehouse_name");
  });

  it("keeps snapshots private and exposes only bounded anonymous RPCs", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.public_retail_publications");
    expect(migration).toContain("p_limit not between 1 and 48");
    expect(migration).toContain("grant execute on function public.list_public_retail_categories");
    expect(migration).toContain("to anon, authenticated");
    expect(readRepository).toContain("createPublicReadClient");
    expect(readRepository).not.toContain("createAdminClient");
    expect(publicClient).toContain("persistSession: false");
    expect(publicClient).not.toMatch(/cookies\(|activeCompany|membership|service.role/i);
  });

  it("uses stable public identities and omits raw ERP and partner fields", () => {
    expect(migration).toContain("public_retail_product_identities");
    const publicReads = migration.slice(migration.indexOf("create or replace function public.list_public_retail_categories"));
    expect(publicReads).not.toMatch(/external_1c|counterparty|contract|company_id|partner_price/i);
  });

  it("switches versions atomically and preserves the previous publication on failure", () => {
    const publishAt = migration.indexOf("create or replace function public.publish_public_retail_candidate");
    const supersedeAt = migration.indexOf("set status = 'superseded'", publishAt);
    const publishCandidateAt = migration.indexOf("set status = 'published'", supersedeAt);
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('public_retail_publication', 0))");
    expect(supersedeAt).toBeGreaterThan(publishAt);
    expect(publishCandidateAt).toBeGreaterThan(supersedeAt);
    const failure = migration.slice(migration.indexOf("create or replace function public.fail_public_retail_candidate"), migration.indexOf("create or replace function public.list_public_retail_categories"));
    expect(failure).toContain("where id = p_publication_id and status = 'building'");
    expect(failure).not.toContain("status = 'published'");
  });

  it("allowlists media and excludes private identity from public DTO storage", () => {
    expect(migration).toContain("novotech-systems-5449b\\.appspot\\.com/o/");
    expect(migration).toContain("novotech-systems-5449b\\.appspot\\.com/'");
    const productTable = migration.slice(migration.indexOf("create table public.public_retail_products"), migration.indexOf("create index public_retail_products_category_idx"));
    expect(productTable).not.toMatch(/external_1c|company|warehouse|available_quantity|partner/i);
  });
});
