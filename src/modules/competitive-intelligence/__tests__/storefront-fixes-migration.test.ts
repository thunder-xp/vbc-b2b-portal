import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260905164925_partner_storefront_ux_and_competitor_fixes.sql"), "utf8");
const original = readFileSync(resolve("supabase/migrations/20260824180021_competitive_price_intelligence.sql"), "utf8");

describe("storefront competitor identity migration", () => {
  it("registers the three fixed competitors without hardcoded generated IDs", () => {
    expect(migration).toContain("('Victiana', 'Victiana'");
    expect(migration).toContain("('Mellitax', 'Mellitax'");
    expect(migration).toContain("('VICTIANA')");
    expect(migration).toContain("('MELLITAX')");
    expect(migration).not.toMatch(/values\s*\(\s*'[0-9a-f]{8}-[0-9a-f-]{27,}'/i);
  });

  it("repairs only the authoritative submitted Victiana mapping", () => {
    expect(migration).toContain("queue.normalized_name = public.normalize_competitive_intelligence_name('VICTIANA')");
    expect(migration).not.toMatch(/update public\.competitor_price_observations/i);
  });

  it("keeps partner reads company-private and server-authorized", () => {
    expect(original).toContain("public.can_access_competitive_intelligence(p_company_id, 'competitive_intelligence.view')");
    expect(original).toContain("where observation.partner_company_id = p_company_id and observation.product_id = p_product_id");
    expect(original).toContain("public.has_active_company_membership(p_company_id)");
  });
});
