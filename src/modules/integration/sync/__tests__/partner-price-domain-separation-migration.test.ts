import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914110338_partner_price_domain_separation.sql"),
  "utf8",
);

describe("partner price-domain separation migration", () => {
  it("classifies A/B/C BCR by stable 1C Ref_Key and never by display name", () => {
    for (const reference of [
      "1668b73c-aea5-11f1-1b94-bc2411369b92",
      "eb632a56-aeb6-11f1-1b94-bc2411369b92",
      "fc52173c-aeb6-11f1-1b94-bc2411369b92",
    ]) {
      expect(sql).toContain(`'${reference}', 'FINAL_CUSTOMER_RETAIL_PRICE'`);
    }
    expect(sql).not.toMatch(/where\s+(?:name|external_code)\s*=\s*'(?:A|B|C)'/i);
  });

  it("excludes final-customer prices before persistent partner staging", () => {
    expect(sql).toMatch(/insert into public\.product_price_sync_stage[\s\S]*price_type_ref[\s\S]*not in[\s\S]*1668b73c/i);
    expect(sql).toContain("FINAL_CUSTOMER_RETAIL_PRICE_NOT_ALLOWED_IN_PARTNER_PROJECTION");
  });

  it("retains classified price-type metadata without retaining retail price rows", () => {
    expect(sql).toContain("alter table public.price_types");
    expect(sql).toContain("assign_one_c_price_type_domain");
    expect(sql).toMatch(/delete from public\.product_prices[\s\S]*1668b73c/i);
  });

  it("persists idempotent exact page diagnostics by type and domain", () => {
    expect(sql).toContain("create table private.price_sync_type_page_metrics");
    expect(sql).toContain("primary key (sync_id, page_number, external_price_type_ref)");
    expect(sql).toContain("on conflict (sync_id, page_number, external_price_type_ref) do update");
    expect(sql).toContain("received_rows");
    expect(sql).toContain("prepared_rows");
    expect(sql).toContain("excluded_rows");
  });

  it("keeps diagnostics and classification inaccessible to browser roles", () => {
    expect(sql).toMatch(/revoke all on table private\.one_c_price_type_domain_registry[\s\S]*authenticated, service_role/i);
    expect(sql).toMatch(/revoke all on table private\.price_sync_type_page_metrics[\s\S]*authenticated, service_role/i);
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)[\s\S]*to\s+(?:anon|authenticated)/i);
  });
});
