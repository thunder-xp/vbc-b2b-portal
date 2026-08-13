import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260813104205_public_retail_showcase_and_datasheet.sql"), "utf8");

describe("Public Retail showcase migration", () => {
  it("projects only governed merchandising labels into the immutable snapshot", () => {
    expect(sql).toContain("assignment.source in ('manual', 'one_c')");
    expect(sql).toContain("assignment.is_curated_visible");
    expect(sql).toContain("p_mode = 'popular' and 'TOP' = any(product.merchandising_labels)");
    expect(sql).toContain("p_mode = 'new' and 'NEW' = any(product.merchandising_labels)");
    expect(sql).not.toContain("random()");
  });

  it("keeps search, price sorting, filters and pagination bounded server-side", () => {
    expect(sql).toContain("nullif(btrim(p_search), '') is not null");
    expect(sql).toContain("p_mode = 'price_asc' then retail_price_amount");
    expect(sql).toContain("p_limit not between 1 and 48");
    expect(sql).toContain("limit p_limit offset p_offset");
  });

  it("publishes only an allowlisted datasheet DTO and strips the raw specification", () => {
    expect(sql).toContain("materialfile\\.dahuasecurity\\.com|www\\.dahuasecurity\\.com");
    expect(sql).toContain("'datasheet', case when product.datasheet_url is null then null");
    expect(sql).toContain("<> 'datasheeturl'");
    expect(sql).toContain("revoke all on function public.list_public_retail_products_v2");
  });
});
