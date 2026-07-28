import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  getRequestForReview: vi.fn(),
  validateApprovalBinding: vi.fn(),
  createPartnerLookupService: vi.fn(),
  createAccessApprovalService: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/src/modules/admin/services", () => ({
  requireAdminPermission: vi.fn().mockResolvedValue({}),
}));
vi.mock("../service-factory", () => ({
  createAccessApprovalService: mocks.createAccessApprovalService,
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/src/modules/integration/services", () => ({
  createPartnerLookupService: mocks.createPartnerLookupService,
}));
vi.mock("@/src/lib/env", () => ({ getOneCEnv: vi.fn(() => ({})) }));

import { approveAccessRequestAction } from "../admin/access-approval.actions";

describe("approveAccessRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue("reviewer-1");
    mocks.createAccessApprovalService.mockReturnValue({
      approveAccessRequest: mocks.approveAccessRequest,
      getRequestForReview: mocks.getRequestForReview,
    });
    mocks.createPartnerLookupService.mockReturnValue({
      validateApprovalBinding: mocks.validateApprovalBinding,
    });
    mocks.getRequestForReview.mockResolvedValue({
      request: {
        requestedFiscalCode: "1014600041304",
      },
    });
    mocks.validateApprovalBinding.mockResolvedValue(undefined);
    mocks.approveAccessRequest.mockResolvedValue(approvedResult());
  });

  it("passes a nullable contract and optional partner code to approval service", async () => {
    const result = await approveAccessRequestAction({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-1",
      decisionReason: " Approved ",
    });

    expect(result.success).toBe(true);
    expect(mocks.validateApprovalBinding).toHaveBeenCalledWith({
      partnerReference: "PARTNER-1",
      contractReference: null,
      priceTypeReference: "PRICE-1",
      expectedFiscalCode: "1014600041304",
    });
    expect(mocks.approveAccessRequest).toHaveBeenCalledWith({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-1",
      decisionReason: "Approved",
      correlationId: expect.any(String),
    });
  });

  it("requires a price type even when contract is optional", async () => {
    const result = await approveAccessRequestAction({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cContractId: null,
      external1cPriceTypeId: " ",
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "INVALID_INPUT",
      message: "Выберите статус партнёра.",
    });
    expect(mocks.approveAccessRequest).not.toHaveBeenCalled();
  });

  it("blocks a binding that cannot be revalidated against 1C", async () => {
    mocks.validateApprovalBinding.mockRejectedValue(
      new Error("Contract does not belong to partner"),
    );

    const result = await approveAccessRequestAction({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cContractId: "CONTRACT-OTHER",
      external1cPriceTypeId: "PRICE-1",
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "APPROVAL_1C_BINDING_INVALID",
    });
    expect(result.message).not.toContain("Contract does not belong");
    expect(mocks.approveAccessRequest).not.toHaveBeenCalled();
  });

  it("blocks approval when the original request has no fiscal code", async () => {
    mocks.getRequestForReview.mockResolvedValue({
      request: { requestedFiscalCode: null },
    });

    const result = await approveAccessRequestAction({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-1",
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "APPROVAL_FISCAL_CODE_REQUIRED",
    });
    expect(mocks.validateApprovalBinding).not.toHaveBeenCalled();
    expect(mocks.approveAccessRequest).not.toHaveBeenCalled();
  });
});

function approvedResult() {
  return {
    request: {
      id: "request-1",
      userId: "partner-1",
      requestedCompanyName: "Partner Company",
      requestedExternal1cId: "PARTNER-1",
      requestedFiscalCode: null,
      contactPhone: null,
      message: null,
      status: "approved",
      companyId: "company-1",
      reviewedBy: "reviewer-1",
      reviewedAt: "2026-07-11T00:00:00.000Z",
      decisionReason: "Approved",
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    },
    requester: {
      email: "partner@example.com",
      fullName: "Partner User",
    },
    company: {},
    membership: {},
  };
}
