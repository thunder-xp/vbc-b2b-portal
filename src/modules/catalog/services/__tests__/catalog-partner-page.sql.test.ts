import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719090000_catalog_partner_page_aggregate.sql"),
  "utf8",
);

describe("catalog_partner_page SQL", () => {
  it("uses allowlisted database sorting and paginates before returning rows", () => {
    expect(migration).toContain("p_sort not in");
    expect(migration).toContain("row_number() over (order by");
    expect(migration).toContain("where ordinal > p_offset and ordinal <= p_offset + p_limit");
    expect(migration).not.toContain("execute format(");
  });

  it("keeps missing commercial values last with deterministic product ordering", () => {
    expect(migration).toContain("asc nulls last");
    expect(migration).toContain("desc nulls last");
    expect(migration).toContain("lower(c.name), c.id");
  });

  it("enforces partner company access and does not grant anonymous execution", () => {
    expect(migration).toContain("public.has_active_company_membership(p_company_id)");
    expect(migration).toContain("public.has_permission(p_company_id, 'catalog.view')");
    expect(migration).toContain("from public, anon");
    expect(migration).not.toMatch(/grant execute[\s\S]*to anon/);
  });

  it("prioritizes exact and prefix SKU search without scanning descriptions for short input", () => {
    expect(migration).toContain("when lower(p.sku) = lower(btrim(p_search)) then 0");
    expect(migration).toContain("when lower(p.sku) like lower(btrim(p_search)) || '%' then 1");
    expect(migration).toContain("char_length(btrim(p_search)) >= 3 and p.short_description ilike");
  });
});

const projectionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719110000_catalog_partner_page_projection.sql"),
  "utf8",
);
const projectionRepairMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719140000_catalog_card_projection_repair.sql"),
  "utf8",
);

describe("catalog_partner_page_v2 SQL", () => {
  it("projects only the bounded page commercial data in the aggregate call", () => {
    expect(projectionMigration).toContain("create or replace function public.catalog_partner_page_v2");
    expect(projectionMigration).toContain("jsonb_array_elements(base_result -> 'items')");
    expect(projectionMigration).toContain("'partner_price_amount'");
    expect(projectionMigration).toContain("'available_quantity'");
  });

  it("retains explicit company access and commercial permission boundaries", () => {
    expect(projectionMigration).toContain("base_result := public.catalog_partner_page(");
    expect(projectionMigration).toContain("public.has_permission(p_company_id, 'prices.view')");
    expect(projectionMigration).toContain("public.has_permission(p_company_id, 'stock.view')");
    expect(projectionMigration).toContain("Stock filter access denied.");
    expect(projectionMigration).toContain("from public, anon");
    expect(projectionMigration).not.toMatch(/grant execute[\s\S]*to anon/);
  });

  it("restores enriched card images and a normalized MSRP currency in the bounded RPC", () => {
    expect(projectionRepairMigration).toContain("coalesce(product.image_source_url, product.image_url)");
    expect(projectionRepairMigration).toContain("coalesce(nullif(btrim(msrp_price.currency), ''), 'USD')");
    expect(projectionRepairMigration).toContain("join public.catalog_products product");
    expect(projectionRepairMigration).not.toContain("createClient(");
  });
});

const facetMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719100000_catalog_scoped_facets.sql"),
  "utf8",
);

const merchandisingProjectionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260728183000_catalog_merchandising_projection.sql"),
  "utf8",
);
const catalogPageSource = readFileSync(
  join(process.cwd(), "app/(partner)/cabinet/catalog/page.tsx"),
  "utf8",
);
const replenishmentCollectionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260820201820_integrate_replenishment_catalog_collection.sql"),
  "utf8",
);
const replenishmentFacetContextMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260820202056_replenishment_catalog_facets_execution_context.sql"),
  "utf8",
);
const cardCharacteristicsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830184347_expose_b2b_catalog_card_characteristics.sql"),
  "utf8",
);
const expandedCardCharacteristicsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830201824_expand_b2b_catalog_card_characteristics.sql"),
  "utf8",
);

describe("catalog_partner_page_v3 page completeness", () => {
  it("uses one canonical eligible set for stable rows and total count", () => {
    expect(merchandisingProjectionMigration).toContain("filtered as (");
    expect(merchandisingProjectionMigration).toContain("commercial as (");
    expect(merchandisingProjectionMigration).toMatch(
      /from ranked\r?\n\s+where ordinal > p_offset and ordinal <= p_offset \+ p_limit/,
    );
    expect(merchandisingProjectionMigration).toContain("'totalCount', (select count(*) from commercial)");
    expect(merchandisingProjectionMigration).toContain("lower(commercial.name),");
    expect(merchandisingProjectionMigration).toContain("commercial.id");
  });

  it("requests a complete twenty-card page from the bounded aggregate", () => {
    expect(catalogPageSource).toContain("const PAGE_SIZE = 20");
    expect(catalogPageSource).toContain("pageSize: PAGE_SIZE");
  });
});

describe("catalog_partner_page_v4 card characteristics", () => {
  it("enriches only the bounded page in one batch and caps governed shortcuts", () => {
    expect(cardCharacteristicsMigration).toContain("base_result := public.catalog_partner_page_v3(");
    expect(cardCharacteristicsMigration).toContain("join public.catalog_product_attributes attribute");
    expect(cardCharacteristicsMigration).toContain("attribute.is_visible");
    expect(cardCharacteristicsMigration).toContain("attribute.is_filterable");
    expect(cardCharacteristicsMigration).toContain("characteristic.characteristic_rank <= 3");
    expect(cardCharacteristicsMigration).not.toContain("catalog_product_attributes attribute on true");
  });

  it("preserves the authenticated boundary and blocks unresolved identities", () => {
    expect(cardCharacteristicsMigration).toContain("set search_path = ''");
    expect(cardCharacteristicsMigration).toContain("attribute.resolution_status in ('not_required', 'resolved')");
    expect(cardCharacteristicsMigration).toContain("from public, anon");
    expect(cardCharacteristicsMigration).not.toMatch(/grant execute[\s\S]*to anon/);
  });
});

describe("catalog_partner_page_v5 card characteristics", () => {
  it("keeps one bounded enrichment query and expands the governed cap to five", () => {
    expect(expandedCardCharacteristicsMigration).toContain("base_result := public.catalog_partner_page_v3(");
    expect(expandedCardCharacteristicsMigration).toContain("join public.catalog_product_attributes attribute");
    expect(expandedCardCharacteristicsMigration).toContain("public.catalog_card_characteristic_priority(attribute.label)");
    expect(expandedCardCharacteristicsMigration).toContain("characteristic.characteristic_rank <= 5");
    expect(expandedCardCharacteristicsMigration).not.toContain("catalog_product_attributes attribute on true");
  });

  it("prioritizes governed light sensitivity and data transmission without rewriting values or units", () => {
    expect(expandedCardCharacteristicsMigration).toContain("светочувств");
    expect(expandedCardCharacteristicsMigration).toContain("передач.*данн");
    expect(expandedCardCharacteristicsMigration).toContain("дальност.*ик");
    expect(expandedCardCharacteristicsMigration).toContain("'value', characteristic.display_value");
    expect(expandedCardCharacteristicsMigration).not.toMatch(/display_value\s*\|\|/);
  });

  it("retains the authenticated boundary and rejects unresolved identities", () => {
    expect(expandedCardCharacteristicsMigration).toContain("set search_path = ''");
    expect(expandedCardCharacteristicsMigration).toContain("attribute.resolution_status in ('not_required', 'resolved')");
    expect(expandedCardCharacteristicsMigration).toContain("from public, anon");
    expect(expandedCardCharacteristicsMigration).not.toMatch(/grant execute[\s\S]*to anon/);
  });
});

describe("replenishment catalog collection SQL", () => {
  it("filters the canonical page and facets through the governed current snapshot", () => {
    expect(replenishmentCollectionMigration).toContain("p_merchandising_label = 'REPLENISHMENT'");
    expect(replenishmentCollectionMigration).toContain("current_warehouse_replenishment_items");
    expect(replenishmentCollectionMigration).toContain("replenishment.singleton_key = 1");
    expect(replenishmentCollectionMigration).toContain("create or replace function public.catalog_partner_facets_v2");
    expect(replenishmentCollectionMigration).toContain("p_selection text default null");
  });

  it("retains authenticated-only execution for both catalog RPCs", () => {
    expect(replenishmentCollectionMigration).toContain("from public, anon");
    expect(replenishmentCollectionMigration).not.toMatch(/grant execute[\s\S]*to anon/);
    expect(replenishmentFacetContextMigration).toContain(") security definer;");
    expect(replenishmentFacetContextMigration).toContain(") set search_path = public;");
    expect(replenishmentFacetContextMigration).toContain("from public, anon");
    expect(replenishmentFacetContextMigration).not.toMatch(/grant execute[\s\S]*to anon/);
  });
});

describe("catalog_partner_facets SQL", () => {
  it("batches current category, search, availability, and attribute scope", () => {
    expect(facetMigration).toContain("create or replace function public.catalog_partner_facets");
    expect(facetMigration).toContain("p_category_id");
    expect(facetMigration).toContain("p_search");
    expect(facetMigration).toContain("p_availability");
    expect(facetMigration).toContain("selected_filter.key <> candidate.attribute_key");
  });

  it("bounds values per facet while retaining selected values", () => {
    expect(facetMigration).toContain("partition by counted.attribute_key");
    expect(facetMigration).toContain("ranked.value_rank <= p_max_values");
    expect(facetMigration).toContain("p_filters -> ranked.attribute_key");
    expect(facetMigration).toContain("ranked.product_coverage::bigint");
  });
});
