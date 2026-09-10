import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root,
  "supabase/migrations/20260909225938_automated_new_product_rolling_365.sql"), "utf8");
const provider = readFileSync(join(root,
  "src/modules/integration/providers/one-c/one-c-product-new-provider.ts"), "utf8");
const catalogRepository = readFileSync(join(root,
  "src/modules/catalog/repositories/supabase/catalog.supabase-repository.ts"), "utf8");
const publicRepository = readFileSync(join(root,
  "src/modules/public-retail/repositories/supabase/public-retail.supabase-repository.ts"), "utf8");
const dailySync = readFileSync(join(root,
  "src/modules/integration/sync/daily-catalog-sync.service.ts"), "utf8");
const adminUi = readFileSync(join(root,
  "src/modules/merchandising/components/MerchandisingAdminTable.tsx"), "utf8");
const merchandisingRepository = readFileSync(join(root,
  "src/modules/merchandising/repositories/supabase/merchandising.supabase-repository.ts"), "utf8");

describe("automated first-import NEW contract", () => {
  it("uses the exact verified 1C contract with complete pagination and no per-product reads", () => {
    expect(provider).toContain("Catalog_Номенклатура_ДополнительныеРеквизиты");
    expect(provider).toContain("Document_ПриходнаяНакладная_Запасы");
    expect(provider).toContain("cb442472-ac8c-11f1-639c-bc2411369b92");
    expect(provider).toContain('row["Значение_Type"] !== "Edm.DateTime"');
    expect(provider).toContain('PS_ЭтоИмпортТМЦ eq true');
    expect(provider).toContain("ПоступлениеОтПоставщика");
    expect(provider).toContain('"$skip": String((page + 1) * PAGE_SIZE)');
    expect(provider).toContain('"$skiptoken" in params');
    expect(provider).toContain("eligible_receipt_client_filter");
  });

  it("keeps facts private, atomically publishes a complete snapshot and gates activation on DHI", () => {
    expect(migration).toContain("alter table public.catalog_product_new_facts enable row level security");
    expect(migration).toMatch(/revoke all on table public\.catalog_product_new_facts,[\s\S]*from public, anon, authenticated/);
    expect(migration).toContain("staged_count <> p_total_catalog_products");
    expect(migration).toContain("delete from public.catalog_product_new_facts fact");
    expect(migration).toContain("4b7d580e-02a3-11ed-6a9e-7239d3b7bd5c");
    expect(migration).toContain("timestamp '2022-11-14 09:00:00'");
    expect(migration).toContain("fact.eligible_receipt_count = 6");
    expect(migration).toContain("MERCHANDISING_NEW_SYSTEM_MANAGED");
    expect(adminUi).toContain('useState<MerchandisingLabelCode>("SPECIAL_OFFER")');
    expect(adminUi).not.toContain('<option value="NEW"');
    expect(merchandisingRepository).toContain('"manage_product_merchandising_v3"');
  });

  it("provides one shared 30/60/90/365 fact projection without public source leakage", () => {
    for (const period of [29, 59, 89, 364]) {
      expect(migration).toContain(`p_business_date - ${period}`);
    }
    expect(migration.match(/source_status <> 'market_entry_before_creation'/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration).toContain("catalog_partner_page_v10");
    expect(migration).toContain("list_public_retail_products_v5");
    expect(migration).toContain("get_public_retail_showcase_v5");
    expect(migration).toContain("count(*) over ()::integer as total_count");
    expect(migration).not.toContain("'new', 48, 0, 365");
    expect(catalogRepository).toContain('"catalog_partner_page_v12"');
    expect(publicRepository).toContain('"list_public_retail_products_v6"');
    expect(publicRepository).toContain('"get_public_retail_showcase_v7"');
    expect(publicRepository).not.toContain("market_entry_source_ref");
    expect(publicRepository).not.toContain("eligible_receipt_count");
  });

  it("publishes NEW before the existing Public Retail orchestration and adds no route request", () => {
    expect(dailySync.indexOf("newProductWriter.publish")).toBeLessThan(dailySync.indexOf("completeSourceSync"));
    expect(dailySync).toContain("snapshot.products.map");
    expect(catalogRepository).not.toContain("catalog_product_new_facts");
    expect(publicRepository).not.toContain("catalog_product_new_facts");
  });
});
