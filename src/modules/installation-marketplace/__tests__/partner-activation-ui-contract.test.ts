import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page=readFileSync(resolve("app/(partner)/cabinet/installation-marketplace/page.tsx"),"utf8");
const legacy=readFileSync(resolve("app/(partner)/cabinet/installation-orders/page.tsx"),"utf8");

describe("Installation Partner workspace UI",()=>{
  it("ships one RU/RO workspace, five real views, activation and 44px controls",()=>{
    expect(page).toContain("Монтаж и заявки");
    expect(page).toContain("Montaj și solicitări");
    expect(page).toContain('"overview", "new", "active", "completed", "profile"');
    expect(page).toContain("PartnerInstallationLists");
    expect(page).toContain("optInInstallationMarketplaceAction");
    expect(page).toContain("state.readiness.items");
    expect(page).toContain("verificationStatus");
    expect(page).toContain("min-h-11");
  });
  it("redirects the old installation-orders deep link to the canonical workspace",()=>{
    expect(legacy).toContain("/cabinet/installation-marketplace?view=${view}${result}");
    expect(legacy).not.toContain("getInstallationAssignmentDispatcher");
  });
  it("has responsive bounded grids without a fixed-width page surface",()=>{
    expect(page).toContain("max-w-6xl");
    expect(page).toContain("overflow-x-auto");
    expect(page).not.toMatch(/w-\[(?:[5-9]\d\d|\d{4,})px\]/);
  });
});
