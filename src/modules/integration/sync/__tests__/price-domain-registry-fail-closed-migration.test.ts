import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914111019_price_domain_registry_fail_closed.sql"),
  "utf8",
);

describe("price-domain registry fail-closed migration", () => {
  it("never promotes a price type from its display name or incidental contract usage", () => {
    expect(sql).toContain("private.one_c_price_type_domain_registry");
    expect(sql).toContain("'INTERNAL/OTHER'");
    expect(sql).not.toMatch(/from public\.one_c_counterparty_contracts/i);
    expect(sql).not.toMatch(/from public\.partner_companies/i);
  });

  it("keeps legacy A/B/C distinct from the new BCR Ref_Key values", () => {
    expect(sql).toContain("41c98d97-e182-11ea-bc65-000c29cf9dd4");
    expect(sql).toContain("41c98d98-e182-11ea-bc65-000c29cf9dd4");
    expect(sql).toContain("41c98d99-e182-11ea-bc65-000c29cf9dd4");
    expect(sql).toMatch(/41c98d97[\s\S]*'INTERNAL\/OTHER'/i);
  });
});
