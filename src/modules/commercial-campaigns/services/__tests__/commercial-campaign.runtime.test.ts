import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("commercial campaign runtime wiring", () => {
  it("uses the corrected repository through the server-only factory", () => {
    expect(read("src/modules/commercial-campaigns/actions/service-factory.ts")).toContain("SupabaseCommercialCampaignRepository");
    expect(read("src/modules/commercial-campaigns/repositories/supabase-commercial-campaign.repository.ts")).toContain("list_partner_commercial_campaigns");
  });
  it("has no browser Supabase or 1C access", () => {
    const components = read("src/modules/commercial-campaigns/components/CampaignBuilder.tsx") + read("src/modules/commercial-campaigns/components/CampaignCartControl.tsx");
    expect(components).not.toContain("createClient");
    expect(components).not.toContain("ONEC_");
    expect(components).not.toContain("product_prices");
  });
  it("registers navigation, search, and bounded lifecycle worker", () => {
    expect(read("src/modules/partner-cabinet/services/workspace-capability.service.ts")).toContain("/cabinet/offers");
    expect(read("src/modules/admin/navigation/admin-navigation.ts")).toContain("/admin/commercial/campaigns");
    expect(read("src/modules/partner-search/services/partner-search.service.ts")).toContain("commercial_campaign");
    expect(read("vercel.json")).toContain("/api/cron/commercial-campaigns");
  });
});
