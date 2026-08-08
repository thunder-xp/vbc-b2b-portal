import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const serviceSource = readFileSync(
  join(process.cwd(), "src/modules/estimates/services/estimate.service.ts"),
  "utf8",
);
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260809004000_estimate_creation_currency_options.sql"),
  "utf8",
);

describe("estimate creation performance boundary", () => {
  it("loads no editor commercial or product projection on the new route", () => {
    const method = serviceSource.slice(
      serviceSource.indexOf("async listAvailableCurrencies"),
      serviceSource.indexOf("async searchExternalNomenclature"),
    );

    expect(method).toContain("listAvailableCurrencyCodes");
    expect(method).not.toContain("getApprovedUsdMdlRateSnapshot");
    expect(method).not.toContain("getProductCommercialViews");
    expect(method).not.toContain("listServices");
  });

  it("evaluates permissions once before scanning governed price rows", () => {
    expect(migration).toContain("can_view_partner_price := public.has_permission");
    expect(migration).toContain("can_view_retail_price := public.has_permission");
    expect(migration).toContain("has_approved_partner_rate");
    expect(migration).not.toMatch(/where[\s\S]*public\.has_permission\(p_company_id/);
  });
});
