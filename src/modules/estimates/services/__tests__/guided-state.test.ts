import { describe, expect, it } from "vitest";

import type { EstimateGuidedStateInput } from "../guided-state";
import { deriveEstimateGuidedState } from "../guided-state";

const base: EstimateGuidedStateInput = {
  lifecycleStatus: "sent",
  estimateStatus: "ready",
  lifecycleOrderId: null,
  versionId: "version-1",
  versionStatus: "sent",
  acceptedVersionId: null,
  readyDocumentId: "document-1",
  currentVersion: true,
  hasDeliveryHistory: true,
  latestDelivery: { status: "sent", openedAt: null, response: null },
  productRequirements: [{ productId: "product-1", quantity: 2 }],
  cartConversions: [],
  companyId: "company-1",
  userId: "user-1",
  permissions: { canManage: true, canSend: true, canConvert: true, canManageOrders: true },
};

const accepted = {
  ...base,
  lifecycleStatus: "accepted",
  versionStatus: "accepted",
  acceptedVersionId: "version-1",
} satisfies EstimateGuidedStateInput;

function conversion(
  items: NonNullable<EstimateGuidedStateInput["cartConversions"][number]["cart"]>["items"],
  overrides: Partial<EstimateGuidedStateInput["cartConversions"][number]> = {},
): EstimateGuidedStateInput["cartConversions"][number] {
  return {
    versionId: "version-1",
    createdBy: "user-1",
    direction: "estimate_to_cart",
    cart: { id: "cart-1", companyId: "company-1", createdBy: "user-1", status: "active", items },
    ...overrides,
  };
}

describe("Estimate guided state", () => {
  it("keeps waiting factual, with resend subordinate and no primary action", () => {
    expect(deriveEstimateGuidedState(base)).toEqual(expect.objectContaining({
      state: "awaiting_customer",
      primaryAction: null,
      secondaryActions: expect.arrayContaining(["resend", "delivery_history"]),
    }));
    expect(deriveEstimateGuidedState({ ...base, latestDelivery: { status: "delivered", openedAt: "2026-09-05T09:00:00Z", response: null } })).toEqual(expect.objectContaining({
      state: "awaiting_customer_opened",
      primaryAction: null,
    }));
  });

  it.each([
    [{ lifecycleStatus: "draft", versionStatus: "prepared", acceptedVersionId: null }, "ready_to_send", "send"],
    [{ lifecycleStatus: "expired", versionStatus: "sent", acceptedVersionId: null }, "expired", "update"],
    [{ lifecycleStatus: "rejected", versionStatus: "rejected", acceptedVersionId: null }, "rejected", null],
    [{ lifecycleStatus: "converted_to_order", lifecycleOrderId: "order-1", versionStatus: "accepted", acceptedVersionId: "version-1" }, "converted_to_order", "open_order"],
  ] as const)("derives governed state %s", (overrides, state, action) => {
    expect(deriveEstimateGuidedState({ ...base, ...overrides })).toEqual(expect.objectContaining({ state, primaryAction: action }));
  });

  it("derives accepted ready-to-order and exact active-cart resume from the shared contract", () => {
    expect(deriveEstimateGuidedState(accepted)).toEqual(expect.objectContaining({ state: "accepted_ready_to_order", primaryAction: "continue_order" }));
    expect(deriveEstimateGuidedState({
      ...accepted,
      cartConversions: [conversion([{ productId: "product-1", quantity: 2, commercialSource: "STANDARD" }])],
    })).toEqual(expect.objectContaining({ state: "resume_checkout", primaryAction: "resume_checkout", resumeCartId: "cart-1" }));
  });

  it.each([
    ["STANDARD sufficient", 3, 0, "resume_checkout"],
    ["mixed total sufficient but STANDARD insufficient", 2, 1, "accepted_already_converted"],
    ["only CAMPAIGN sufficient", 0, 3, "accepted_already_converted"],
    ["STANDARD sufficient plus CAMPAIGN", 3, 100, "resume_checkout"],
    ["STANDARD exceeds requirement", 5, 0, "resume_checkout"],
  ] as const)("counts only STANDARD quantity: %s", (_scenario, standard, campaign, expectedState) => {
    const items = [
      ...(standard > 0 ? [{ productId: "product-1", quantity: standard, commercialSource: "STANDARD" as const }] : []),
      ...(campaign > 0 ? [{ productId: "product-1", quantity: campaign, commercialSource: "CAMPAIGN" as const }] : []),
    ];

    const result = deriveEstimateGuidedState({
      ...accepted,
      productRequirements: [{ productId: "product-1", quantity: 3 }],
      cartConversions: [conversion(items)],
    });

    expect(result.state).toBe(expectedState);
    expect(result.primaryAction).toBe(expectedState === "resume_checkout" ? "resume_checkout" : null);
  });

  it("requires every product from STANDARD context", () => {
    const result = deriveEstimateGuidedState({
      ...accepted,
      productRequirements: [
        { productId: "product-1", quantity: 3 },
        { productId: "product-2", quantity: 6 },
      ],
      cartConversions: [conversion([
        { productId: "product-1", quantity: 3, commercialSource: "STANDARD" },
        { productId: "product-1", quantity: 5, commercialSource: "CAMPAIGN" },
        { productId: "product-2", quantity: 5, commercialSource: "STANDARD" },
        { productId: "product-2", quantity: 1, commercialSource: "CAMPAIGN" },
      ])],
    });

    expect(result).toEqual(expect.objectContaining({ state: "accepted_already_converted", primaryAction: null, resumeCartId: null }));
  });

  it("aggregates multiple STANDARD rows while unknown source evidence fails closed", () => {
    expect(deriveEstimateGuidedState({
      ...accepted,
      productRequirements: [{ productId: "product-1", quantity: 3 }],
      cartConversions: [conversion([
        { productId: "product-1", quantity: 1, commercialSource: "STANDARD" },
        { productId: "product-1", quantity: 2, commercialSource: "STANDARD" },
        { productId: "product-1", quantity: 100, commercialSource: null },
      ])],
    })).toEqual(expect.objectContaining({ state: "resume_checkout", resumeCartId: "cart-1" }));

    expect(deriveEstimateGuidedState({
      ...accepted,
      productRequirements: [{ productId: "product-1", quantity: 3 }],
      cartConversions: [conversion([{ productId: "product-1", quantity: 3, commercialSource: null }])],
    })).toEqual(expect.objectContaining({ state: "accepted_already_converted", primaryAction: null, resumeCartId: null }));
  });

  it.each([
    { versionId: "version-other", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-1", cartStatus: "active", direction: "estimate_to_cart" },
    { versionId: "version-1", createdBy: "user-other", cartCompanyId: "company-1", cartUserId: "user-1", cartStatus: "active", direction: "estimate_to_cart" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-other", cartUserId: "user-1", cartStatus: "active", direction: "estimate_to_cart" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-other", cartStatus: "active", direction: "estimate_to_cart" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-1", cartStatus: "abandoned", direction: "estimate_to_cart" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-1", cartStatus: "active", direction: "cart_to_estimate" },
  ] as const)("never resumes a conversion outside its identity and active-cart guards", ({ versionId, createdBy, cartCompanyId, cartUserId, cartStatus, direction }) => {
    const evidence = conversion(
      [{ productId: "product-1", quantity: 2, commercialSource: "STANDARD" }],
      { versionId, createdBy, direction },
    );
    evidence.cart = { ...evidence.cart!, companyId: cartCompanyId, createdBy: cartUserId, status: cartStatus };
    const result = deriveEstimateGuidedState({ ...accepted, cartConversions: [evidence] });
    expect(result.state).not.toBe("resume_checkout");
    expect(result.primaryAction).not.toBe("resume_checkout");
  });

  it("fails closed when send or order permissions are absent", () => {
    expect(deriveEstimateGuidedState({ ...base, lifecycleStatus: "draft", versionStatus: "prepared", permissions: { ...base.permissions, canSend: false } }).primaryAction).toBeNull();
    expect(deriveEstimateGuidedState({ ...base, lifecycleStatus: "accepted", versionStatus: "accepted", acceptedVersionId: "version-1", permissions: { ...base.permissions, canConvert: false } }).primaryAction).toBeNull();
  });
});
