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
    const accepted = { ...base, lifecycleStatus: "accepted", versionStatus: "accepted", acceptedVersionId: "version-1" } satisfies EstimateGuidedStateInput;
    expect(deriveEstimateGuidedState(accepted)).toEqual(expect.objectContaining({ state: "accepted_ready_to_order", primaryAction: "continue_order" }));
    expect(deriveEstimateGuidedState({ ...accepted, cartConversions: [{
      versionId: "version-1", createdBy: "user-1", direction: "estimate_to_cart",
      cart: { id: "cart-1", companyId: "company-1", createdBy: "user-1", status: "active", items: [{ productId: "product-1", quantity: 2 }] },
    }] })).toEqual(expect.objectContaining({ state: "resume_checkout", primaryAction: "resume_checkout", resumeCartId: "cart-1" }));
  });

  it.each([
    { versionId: "version-other", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-1" },
    { versionId: "version-1", createdBy: "user-other", cartCompanyId: "company-1", cartUserId: "user-1" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-other", cartUserId: "user-1" },
    { versionId: "version-1", createdBy: "user-1", cartCompanyId: "company-1", cartUserId: "user-other" },
  ])("never resumes another version, user, or company cart", ({ versionId, createdBy, cartCompanyId, cartUserId }) => {
    const result = deriveEstimateGuidedState({ ...base, lifecycleStatus: "accepted", versionStatus: "accepted", acceptedVersionId: "version-1", cartConversions: [{
      versionId, createdBy, direction: "estimate_to_cart",
      cart: { id: "cart-1", companyId: cartCompanyId, createdBy: cartUserId, status: "active", items: [{ productId: "product-1", quantity: 2 }] },
    }] });
    expect(result.state).not.toBe("resume_checkout");
    expect(result.primaryAction).not.toBe("resume_checkout");
  });

  it("fails closed when send or order permissions are absent", () => {
    expect(deriveEstimateGuidedState({ ...base, lifecycleStatus: "draft", versionStatus: "prepared", permissions: { ...base.permissions, canSend: false } }).primaryAction).toBeNull();
    expect(deriveEstimateGuidedState({ ...base, lifecycleStatus: "accepted", versionStatus: "accepted", acceptedVersionId: "version-1", permissions: { ...base.permissions, canConvert: false } }).primaryAction).toBeNull();
  });
});
