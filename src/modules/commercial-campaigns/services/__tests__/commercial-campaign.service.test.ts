import { describe, expect, it, vi } from "vitest";

import type { CommercialCampaignRepository } from "../../repositories";
import { CommercialCampaignService } from "../commercial-campaign.service";

describe("CommercialCampaignService", () => {
  it("uses one bounded audience-scoped list request", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await service.listPartner("user-1", { filter: "ending", page: 2, pageSize: 20 });
    expect(repository.listPartner).toHaveBeenCalledWith({ companyId: "company-1", filter: "ending", limit: 20, offset: 20 });
  });

  it("rejects invalid cart quantity before repository mutation", async () => {
    const repository = stubRepository();
    const service = new CommercialCampaignService(repository, workspace() as never);
    await expect(service.addToCart("user-1", "item-1", 0, "request-1")).rejects.toThrow("Campaign quantity is invalid");
    expect(repository.addToCart).not.toHaveBeenCalled();
  });

  it("does not let analytics failure block partner flow", async () => {
    const repository = stubRepository();
    vi.mocked(repository.recordEngagement).mockRejectedValue(new Error("analytics down"));
    const service = new CommercialCampaignService(repository, workspace() as never);
    await expect(service.recordEngagement("user-1", { campaignId: "campaign-1", eventType: "impression", requestId: "request-1" })).resolves.toBeUndefined();
  });

  it("rejects arbitrary price ownership in draft input", () => {
    const service = new CommercialCampaignService(stubRepository(), workspace() as never);
    expect(() => service.createDraft({ ...validDraft(), items: [{ ...validDraft().items[0], minimumQuantity: 3, maximumQuantityPerCompany: 2 }] })).toThrow("Campaign quantity limits are invalid");
  });
});

function workspace() { return { getWorkspaceContext: vi.fn().mockResolvedValue({ accessState: "active", companyId: "company-1" }) }; }
function validDraft() { return { code: "TEST_1", name: "Test campaign", partnerTitle: "Partner offer", partnerDescription: "Long partner campaign description", campaignType: "product_offer" as const, startsAt: "2026-07-31T10:00:00Z", endsAt: "2026-08-31T10:00:00Z", priority: 100, termsSummary: "Current price applies", audienceMode: "explicit_company" as const, companyIds: ["company-1"], items: [{ productId: "product-1", sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only" as const, governedBenefitReference: null, partnerMessage: null }] }; }
function stubRepository(): CommercialCampaignRepository { return { listPartner: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }), getPartner: vi.fn(), addToCart: vi.fn(), recordEngagement: vi.fn(), listAdmin: vi.fn(), getAdmin: vi.fn(), getBuilderOptions: vi.fn(), createDraft: vi.fn(), publish: vi.fn(), pause: vi.fn() }; }
