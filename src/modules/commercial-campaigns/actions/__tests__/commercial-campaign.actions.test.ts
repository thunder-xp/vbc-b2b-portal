import { beforeEach, describe, expect, it, vi } from "vitest";

import { CAMPAIGN_ERROR_MESSAGES } from "../../campaign-draft.contract";
import { CommercialCampaignRepositoryError } from "../../repositories";
import type { CampaignDraftInput } from "../../types";

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  recordDraftFailure: vi.fn(),
  requireAdminPermission: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../access-control/actions/service-factory", () => ({ getAuthenticatedUserId: vi.fn() }));
vi.mock("../../../admin/services", () => ({ requireAdminPermission: mocks.requireAdminPermission }));
vi.mock("../service-factory", () => ({
  createCommercialCampaignService: () => ({
    createDraft: mocks.createDraft,
    recordDraftFailure: mocks.recordDraftFailure,
  }),
}));

import { createCampaignDraftAction } from "../commercial-campaign.actions";

describe("createCampaignDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
    mocks.recordDraftFailure.mockResolvedValue(undefined);
  });

  it("maps an allowlisted RPC error to actionable copy and safe Admin Operations metadata", async () => {
    mocks.createDraft.mockRejectedValue(new CommercialCampaignRepositoryError("P0001", "CAMPAIGN_CODE_CONFLICT"));

    const result = await createCampaignDraftAction(validDraft());

    expect(result).toMatchObject({
      success: false,
      message: CAMPAIGN_ERROR_MESSAGES.CAMPAIGN_CODE_CONFLICT,
      errorCode: "CAMPAIGN_CODE_CONFLICT",
    });
    expect(mocks.recordDraftFailure).toHaveBeenCalledWith(expect.objectContaining({
      stage: "create_draft_rpc",
      safeErrorCode: "CAMPAIGN_CODE_CONFLICT",
      serverRpcCode: "P0001",
      hasDraftData: true,
      itemCount: 1,
      hasAudience: true,
    }));
  });

  it("never returns raw database errors to the administrator", async () => {
    mocks.createDraft.mockRejectedValue(new CommercialCampaignRepositoryError("2201B", null));

    const result = await createCampaignDraftAction(validDraft());

    expect(result).toMatchObject({
      success: false,
      message: CAMPAIGN_ERROR_MESSAGES.UNKNOWN_SERVER_ERROR,
      errorCode: "UNKNOWN_SERVER_ERROR",
    });
    expect(result.message).not.toContain("regular expression");
  });

  it("revalidates and returns the one created draft", async () => {
    mocks.createDraft.mockResolvedValue("campaign-1");

    await expect(createCampaignDraftAction(validDraft())).resolves.toMatchObject({ success: true, data: { id: "campaign-1" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/commercial/campaigns");
    expect(mocks.recordDraftFailure).not.toHaveBeenCalled();
  });
});

function validDraft(): CampaignDraftInput {
  return {
    contractVersion: 1,
    requestId: "22222222-2222-4222-8222-222222222222",
    code: "AIR_SHIELD_2026",
    name: "Dahua Air Shield",
    partnerTitle: "Всегда готов к защите",
    partnerDescription: "Управляемая кампания для партнёров Novotech.",
    campaignType: "product_offer",
    startsAt: "2026-09-25T10:00:00.000Z",
    endsAt: "2026-10-25T10:00:00.000Z",
    priority: 100,
    termsSummary: "Действуют текущие цены и остатки.",
    audienceMode: "explicit_company",
    companyIds: ["33333333-3333-4333-8333-333333333333"],
    items: [{
      productId: "44444444-4444-4444-8444-444444444444",
      sortOrder: 1,
      minimumQuantity: 1,
      maximumQuantityPerCompany: 5,
      benefitType: "informational_only",
      governedBenefitReference: null,
      partnerMessage: null,
    }],
  };
}
