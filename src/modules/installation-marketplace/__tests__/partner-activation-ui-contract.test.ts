import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page=readFileSync(resolve("app/(partner)/cabinet/installation-marketplace/page.tsx"),"utf8");
const legacy=readFileSync(resolve("app/(partner)/cabinet/installation-orders/page.tsx"),"utf8");
const form=readFileSync(resolve("src/modules/installation-marketplace/partner-activation-form.tsx"),"utf8");
const actions=readFileSync(resolve("src/modules/installation-marketplace/actions.ts"),"utf8");
const repository=readFileSync(resolve("src/modules/installation-marketplace/supabase.repository.ts"),"utf8");

describe("Installation Partner workspace UI",()=>{
  it("ships one RU/RO workspace, five real views, activation and 44px controls",()=>{
    expect(page).toContain("Монтаж и заявки");
    expect(page).toContain("Montaj și solicitări");
    expect(page).toContain('"overview", "new", "active", "completed", "profile"');
    expect(page).toContain("PartnerInstallationLists");
    expect(page).toContain("PartnerActivationForm");
    expect(page).toContain("optInInstallationMarketplaceAction");
    expect(page).toContain("state.readiness.items");
    expect(form).toContain("verificationStatus");
    expect(form).toContain("min-h-11");
  });
  it("redirects the old installation-orders deep link to the canonical workspace",()=>{
    expect(legacy).toContain("/cabinet/installation-marketplace?view=${view}${result}");
    expect(legacy).not.toContain("getInstallationAssignmentDispatcher");
  });
  it("has responsive bounded grids without a fixed-width page surface",()=>{
    expect(page).toContain("max-w-6xl");
    expect(form).toContain("overflow-y-auto");
    expect(page).not.toMatch(/w-\[(?:[5-9]\d\d|\d{4,})px\]/);
    expect(form).not.toMatch(/w-\[(?:[5-9]\d\d|\d{4,})px\]/);
  });
  it("shows deterministic pending, success, and conflict feedback without leaving a stale revision",()=>{
    expect(form).toContain("useActionState(saveInstallationMarketplaceActivationAction");
    expect(form).toContain('disabled={pending}');
    expect(form).toContain('aria-live="polite"');
    expect(form).toContain('value={result.revision}');
    expect(form).toContain('router.refresh()');
    expect(actions).toContain('status:"success"');
    expect(actions).toContain('revision:result.revision');
    expect(actions).toContain('error.code==="conflict"');
    expect(repository).toContain('code === "40001"');
  });
});
