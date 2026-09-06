import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("partner platform visual unification contract", () => {
  it("keeps locale in UserMenu and removes the permanent header control", () => {
    expect(read("src/modules/partner-cabinet/components/PartnerHeader.tsx")).not.toContain("PartnerLanguageSwitch");
    expect(read("src/modules/partner-cabinet/components/UserMenu.tsx")).toContain('variant="menu"');
  });

  it("uses one partner-scoped square rule with explicit semantic exceptions", () => {
    const css = read("app/globals.css");
    expect(css).toContain('[data-partner-portal] :where([class*="rounded"])');
    expect(css).toContain('[data-partner-radius="semantic"]');
    expect(read("src/modules/partner-cabinet/components/PartnerLayout.tsx")).toContain("data-partner-portal");
  });

  it("keeps Orders controls in one compact desktop row without explanatory header copy", () => {
    const orders = read("app/(partner)/cabinet/orders/page.tsx");
    expect(orders).not.toContain("copy.eyebrow");
    expect(orders).not.toContain("copy.description");
    expect(orders).toContain("lg:flex-row lg:items-center");
  });

  it("uses deterministic dashboard, opportunity, and catalog working geometry", () => {
    expect(read("src/modules/partner-cabinet/components/OperationalDashboard.tsx")).toContain("data-dashboard-priority-work");
    const opportunities = read("app/(partner)/cabinet/opportunities/page.tsx");
    expect(opportunities).toContain('data-opportunity-lane="wide"');
    expect(opportunities).toContain('data-opportunity-lane="compact"');
    expect(opportunities).toContain("--business-order");
    const list = read("src/modules/catalog/components/ProductList.tsx");
    expect(list).toContain("min-[1440px]:flex-nowrap");
    expect(list.match(/h-\[5\.25rem\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("persists only a governed self-profile locale with no anonymous grant", () => {
    const migration = read("supabase/migrations/20260906183239_add_partner_locale_preference_20260906.sql");
    expect(migration).toContain("preferred_locale in ('ru', 'ro')");
    expect(migration).toContain("grant update (preferred_locale) on public.user_profiles to authenticated");
    expect(migration).not.toMatch(/grant .*preferred_locale.* anon/i);
  });
});
