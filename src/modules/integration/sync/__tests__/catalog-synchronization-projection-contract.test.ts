import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projection = readFileSync("supabase/migrations/20260812120000_public_retail_projection.sql", "utf8");
const seo = readFileSync("supabase/migrations/20260816115423_public_retail_seo_inventory.sql", "utf8");
const orchestrator = readFileSync("src/modules/integration/sync/catalog-synchronization-orchestrator.ts", "utf8");

describe("unified synchronization projection contract", () => {
  it("projects price only from the global canonical RETAIL type", () => {
    expect(projection).toMatch(/price\.company_id is null[\s\S]*price_type\.external_code = 'UU-000020'/i);
    expect(projection).not.toMatch(/partner_price/i);
  });

  it("projects governed media, descriptions, and visible resolved specifications", () => {
    expect(projection).toContain("product.image_source_url");
    expect(projection).toContain("coalesce(projected.full_description, projected.description)");
    expect(projection).toContain("from public.catalog_product_attributes attribute");
    expect(projection).toMatch(/attribute\.resolution_status in \('not_required', 'resolved'\)/i);
  });

  it("derives a public-safe availability enum without persisting exact quantity", () => {
    for (const state of ["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"]) expect(projection).toContain(`'${state}'`);
    expect(projection).not.toMatch(/public_retail_products[\s\S]{0,500}available_quantity/i);
  });

  it("keeps categories versioned and excludes the internal Project Equipment branch from SEO", () => {
    expect(projection).toContain("public.public_retail_categories");
    expect(projection).toContain("publication_id");
    expect(seo).toContain("PROJECT EQUIPMENT");
  });

  it("runs only from source synchronization completion, never a public request path", () => {
    expect(orchestrator).toContain("completeSourceSync");
    expect(orchestrator).toContain("publishCurrentProjection");
    expect(orchestrator).not.toMatch(/createPublicReadClient|cookies\(|headers\(/);
  });
});
