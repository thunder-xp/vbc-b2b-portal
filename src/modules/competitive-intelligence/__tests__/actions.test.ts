import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createObservation: vi.fn(),
  getLocale: vi.fn(),
  getWorkspace: vi.fn(),
}));

vi.mock("../../partner-locale/server", () => ({ getPartnerLocale: mocks.getLocale }));
vi.mock("../../partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.getWorkspace }));
vi.mock("../repository", () => ({
  CompetitiveIntelligenceRepository: class {
    createObservation = mocks.createObservation;
    removeEvidence = vi.fn();
    uploadEvidence = vi.fn();
  },
  CompetitiveIntelligenceRepositoryError: class extends Error {},
}));
vi.mock("../../admin/services", () => ({ requireAdminPermission: vi.fn() }));

import { createCompetitiveObservationAction } from "../actions";

describe("createCompetitiveObservationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocale.mockResolvedValue("ru");
    mocks.getWorkspace.mockResolvedValue({
      success: true,
      data: {
        accessState: "active",
        companyId: "11111111-1111-4111-8111-111111111111",
        capabilities: { canManageCompetitiveIntelligence: true },
      },
    });
    mocks.createObservation.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      duplicate: false,
      idempotent: false,
      comparisonStatus: "vat_not_comparable",
      deltaAmount: null,
      deltaPercent: null,
    });
  });

  it("submits without partner VAT or validity input and persists governed values", async () => {
    const formData = new FormData();
    formData.set("productId", "22222222-2222-4222-8222-222222222222");
    formData.set("idempotencyKey", "44444444-4444-4444-8444-444444444444");
    formData.set("competitorId", "55555555-5555-4555-8555-555555555555");
    formData.set("price", "2450");
    formData.set("currency", "MDL");
    formData.set("quantity", "1");
    formData.set("observationDate", "2026-08-24");
    formData.set("sourceType", "quotation");

    const result = await createCompetitiveObservationAction(null, formData);

    expect(result.success).toBe(true);
    expect(mocks.createObservation).toHaveBeenCalledWith(expect.objectContaining({
      p_vat_mode: "included",
      p_valid_until: null,
    }));
  });
});
