import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(file), "utf8");

describe("partner dashboard client boundaries", () => {
  it("keeps the shared layout server-rendered and isolates mobile drawer state", () => {
    const layout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const mobileNavigation = read("src/modules/partner-cabinet/components/PartnerMobileNavigation.tsx");

    expect(layout).not.toMatch(/^"use client"/);
    expect(layout).toContain("<PartnerMobileNavigation");
    expect(mobileNavigation).toMatch(/^"use client"/);
    expect(mobileNavigation).toContain("useState(false)");
  });

  it("does not pull component barrels into the dashboard runtime path", () => {
    const page = read("app/(partner)/cabinet/page.tsx");
    const layout = read("app/(partner)/cabinet/layout.tsx");
    const dashboard = read("src/modules/partner-cabinet/components/OperationalDashboard.tsx");
    const header = read("src/modules/partner-cabinet/components/PartnerHeader.tsx");

    for (const source of [page, layout, dashboard, header]) {
      expect(source).not.toMatch(/from ["'][^"']+\/components["']/);
    }
    expect(page).not.toContain('from "@/src/modules/service-center"');
    expect(layout).not.toContain('from "@/src/modules/partner-cabinet/actions"');
  });
});
