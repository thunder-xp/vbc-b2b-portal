import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("commercial opportunity runtime boundaries", () => {
  it("registers partner navigation, dashboard and a private canonical route", () => {
    expect(read("src/modules/partner-cabinet/services/workspace-capability.service.ts")).toContain('/cabinet/opportunities');
    expect(read("src/modules/partner-cabinet/components/OperationalDashboard.tsx")).toContain("opportunities.slice(0, 4)");
    expect(read("app/(partner)/cabinet/opportunities/page.tsx")).toContain("Возможности для закупки");
  });

  it("delegates cart mutations and never creates orders directly", () => {
    const card = read("src/modules/commercial-opportunities/components/OpportunityCard.tsx");
    expect(card).toContain("addToCartAction(product.id");
    expect(card).not.toMatch(/createOrder|submitOrder|Document_Заказ/);
  });

  it("uses one bounded opportunity read for both page and dashboard", () => {
    const repository = read("src/modules/commercial-opportunities/repositories/supabase/commercial-opportunity.supabase-repository.ts");
    expect(repository.match(/\.rpc\(/g)).toHaveLength(2);
    expect(repository).toContain("list_partner_commercial_opportunities");
    expect(read("src/modules/partner-cabinet/services/workspace-home.service.ts")).toContain("limit: 4");
  });

  it("protects the worker with canonical cron authorization", () => {
    const route = read("app/api/cron/commercial-opportunities/route.ts");
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("createAdminClient");
    expect(route).not.toContain("ONEC_");
  });
});
