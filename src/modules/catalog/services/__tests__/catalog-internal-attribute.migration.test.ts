import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = source("supabase/migrations/20260922134835_catalog_internal_merchandising_attribute_semantics.sql");
const publicCandidate = source("supabase/migrations/20260921110734_public_retail_candidate_build_headroom.sql");
const catalogRepository = source("src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts");
const newProductProvider = source("src/modules/integration/providers/one-c/one-c-product-new-provider.ts");

describe("internal merchandising attribute storage contract", () => {
  it("persists explicit semantics and makes internal exposure fail closed", () => {
    expect(migration).toContain("add column if not exists classification text not null");
    expect(migration).toContain("'MERCHANDISING_INTERNAL'");
    expect(migration).toContain("or (not is_visible and not is_filterable)");
    expect(migration).toContain("classification = excluded.classification");
    expect(migration).toContain("and classification in ('CUSTOMER_SPECIFICATION', 'FACETABLE_SPECIFICATION')");
    expect(migration).toContain("revoke select on public.catalog_product_attributes from authenticated");
  });

  it("keeps B2B detail/comparison and B2C specifications/facets behind exposure flags", () => {
    expect(catalogRepository).toContain('.eq("is_visible", true)');
    expect(publicCandidate).toContain("attribute.product_id = eligible.id and attribute.is_visible");
    expect(publicCandidate).toContain("source.is_filterable and source.is_visible");
  });

  it("preserves the independent new-product source path by stable identity", () => {
    expect(newProductProvider).toContain("PRODUCT_CREATION_DATE_PROPERTY_REF");
    expect(newProductProvider).toContain('text(row["Свойство_Key"]).toLowerCase() !== PRODUCT_CREATION_DATE_PROPERTY_REF');
  });
});

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
