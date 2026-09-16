import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page=readFileSync(resolve("app/(partner)/cabinet/installation-marketplace/page.tsx"),"utf8");
describe("Installation Marketplace Partner activation UI",()=>{
  it("ships RU/RO, explicit opt-in, readiness, declarations and 44px controls",()=>{
    expect(page).toContain("Стать партнёром по монтажу");
    expect(page).toContain("Deveniți partener de instalare");
    expect(page).toContain("optInInstallationMarketplaceAction");
    expect(page).toContain("state.readiness.items");
    expect(page).toContain("verificationStatus");
    expect(page).toContain("min-h-11");
  });
  it("has responsive bounded grids without a fixed-width page surface",()=>{
    expect(page).toContain("max-w-6xl");
    expect(page).toContain("sm:grid-cols-2");
    expect(page).toContain("lg:grid-cols-3");
    expect(page).not.toMatch(/w-\[(?:[5-9]\d\d|\d{4,})px\]/);
  });
});
