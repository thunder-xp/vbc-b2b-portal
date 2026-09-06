import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260906140000_governed_retail_msrp_projection.sql"),
  "utf8",
);
const publicRetailProjection = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260812120000_public_retail_projection.sql"),
  "utf8",
);
const retailFoundation = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260729190000_retail_price_history_foundation.sql"),
  "utf8",
);

describe("governed RETAIL and MSRP projection", () => {
  it("returns both independent B2B price types in one bounded authorized RPC", () => {
    expect(migration).toContain("get_product_price_projection_v2");
    expect(migration).toContain("p_external_price_type_ids text[]");
    expect(migration).toContain("coalesce(array_length(p_product_ids, 1), 0) not between 1 and 250");
    expect(migration).toContain("e181c772-93fc-11e9-94cb-000c2988d323");
    expect(migration).toContain("d9c92519-658b-11e8-80d3-000c29a58b59");
    expect(migration).toContain("price.company_id is null");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("from public, anon");
  });

  it("adds canonical RETAIL MDL to the existing one-request catalog page", () => {
    expect(migration).toContain("catalog_partner_page_v7");
    expect(migration).toContain("catalog_partner_page_v6");
    expect(migration).toContain("'retail_price_amount', retail.price_amount");
    expect(migration).toContain("upper(btrim(price.currency)) in ('MDL', '498')");
    expect(migration).not.toMatch(/retail\.price_amount\s*[*\/]\s*[^,\n]+rate/i);
  });

  it("keeps the shared public B2C projection on canonical RETAIL/MDL rather than MSRP", () => {
    expect(publicRetailProjection).toContain("price_type.external_code = 'UU-000020'");
    expect(retailFoundation).toContain("type.currency_code = 'MDL'");
    expect(retailFoundation).toContain("price.currency = 'MDL'");
    expect(publicRetailProjection).not.toContain("d9c92519-658b-11e8-80d3-000c29a58b59");
  });
});
