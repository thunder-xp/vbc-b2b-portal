import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(partner)/cabinet/catalog/[slug]/page.tsx"), "utf8");
const repository = readFileSync(resolve("src/modules/competitive-intelligence/repository.ts"), "utf8");
const form = readFileSync(resolve("src/modules/competitive-intelligence/components/CompetitiveObservationForm.tsx"), "utf8");
const cron = readFileSync(resolve("app/api/cron/commercial-intelligence/route.ts"), "utf8");

describe("competitive intelligence architecture boundaries", () => {
  it("loads one bounded product aggregate only for the analytics tab", () => {
    expect(page).toContain('activeTab === "analytics" && companyId');
    expect(page).toContain("getPartnerProduct(companyId, productResult.data.id)");
    expect(repository).toContain("p_limit: 30");
    expect(repository).not.toMatch(/for\s*\(/);
  });

  it("keeps aggregation in the existing background projection path", () => {
    expect(cron).toContain("refresh_competitive_price_intelligence");
    expect(page).not.toContain("refresh_competitive_price_intelligence");
  });

  it("does not add a chart dependency or direct Supabase UI query", () => {
    expect(form).not.toContain("createClient");
    expect(form).not.toContain("supabase");
    expect(form).not.toContain("recharts");
    expect(form).not.toContain("chart.js");
  });

  it("uses responsive grids without page-level horizontal overflow", () => {
    expect(form).toContain("sm:grid-cols-2");
    expect(form).toContain("xl:grid-cols-3");
    expect(form).toContain("min-w-0");
    expect(form).not.toContain("lg:grid-cols-[");
    expect(form).not.toContain("overflow-x-auto");
  });

  it("governs VAT and removed validity server-side for new observations", () => {
    expect(form).not.toContain('name="vatMode"');
    expect(form).not.toContain('name="validUntil"');
    const actions = readFileSync(resolve("src/modules/competitive-intelligence/actions.ts"), "utf8");
    expect(actions).toContain('NEW_OBSERVATION_VAT_MODE = "included"');
    expect(actions).toContain("p_vat_mode: NEW_OBSERVATION_VAT_MODE");
    expect(actions).toContain("p_valid_until: null");
    expect(actions).not.toContain('enumValue(formData, "vatMode"');
    expect(actions).not.toContain('dateValue(formData, "validUntil"');
  });
});
