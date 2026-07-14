import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  createAccessApprovalService: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../service-factory", () => ({
  createAccessApprovalService: mocks.createAccessApprovalService,
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));

import { approveAccessRequestAction } from "../admin/access-approval.actions";

describe("approveAccessRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue("reviewer-1");
    mocks.createAccessApprovalService.mockReturnValue({
      approveAccessRequest: mocks.approveAccessRequest,
    });
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
    expect(mocks.approveAccessRequest).toHaveBeenCalledWith({
      actorUserId: "reviewer-1",
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cCode: null,
      external1cContractId: null,
      external1cPriceTypeId: "PRICE-1",
      decisionReason: "Approved",
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
