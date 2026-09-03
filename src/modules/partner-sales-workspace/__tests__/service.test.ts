import { describe, expect, it, vi } from "vitest";

import type { EstimateSalesOpportunityRepository } from "../repository";
import { PartnerSalesWorkspaceService } from "../service";
import type { EstimateCartConversionEvidence, EstimateSalesOpportunityPermissions, EstimateSalesOpportunitySource } from "../types";

const companyId = "company-1";
const userId = "user-1";
const base: EstimateSalesOpportunitySource = {
  versionId: "version-1", estimateId: "estimate-1", estimateNumber: "KP-1", proposalName: "Office CCTV", customerName: "Client SRL",
  projectName: "Office", amount: 38400, currency: "MDL", versionStatus: "prepared", estimateLifecycleStatus: "draft", acceptedVersionId: null,
  sentAt: null, lifecycleExpiresAt: null, acceptedAt: null, estimateStatus: "ready", createdAt: "2026-09-01T10:00:00Z", readyDocumentId: "document-1",
  productRequirements: [{ productId: "product-1", quantity: 2 }], cartConversions: [], latestDelivery: null,
};
const allowed: EstimateSalesOpportunityPermissions = { canView: true, canSend: true, canConvert: true, canManageOrders: true };

function accepted(overrides: Partial<EstimateSalesOpportunitySource> = {}): EstimateSalesOpportunitySource {
  return {
    ...base,
    versionStatus: "accepted",
    estimateLifecycleStatus: "accepted",
    acceptedVersionId: base.versionId,
    acceptedAt: "2026-09-02T10:00:00Z",
    readyDocumentId: null,
    ...overrides,
  };
}

function conversion(overrides: Partial<EstimateCartConversionEvidence> = {}): EstimateCartConversionEvidence {
  return {
    versionId: "version-1",
    requestKey: "request-1",
    createdBy: userId,
    direction: "estimate_to_cart",
    cart: {
      id: "cart-1",
      companyId,
      createdBy: userId,
      status: "active",
      items: [{ productId: "product-1", quantity: 2 }],
    },
    ...overrides,
  };
}

function repository(rows: EstimateSalesOpportunitySource[]): EstimateSalesOpportunityRepository {
  return { listCurrent: vi.fn().mockResolvedValue(rows) };
}

function list(rows: EstimateSalesOpportunitySource[], permissions = allowed, limit = 6) {
  return new PartnerSalesWorkspaceService(repository(rows)).listEstimateOpportunities(companyId, userId, permissions, limit);
}

describe("PartnerSalesWorkspaceService", () => {
  it("derives accepted, ready-to-send, and awaiting-customer work from the bounded Estimate read", async () => {
    const repo = repository([
      accepted(),
      { ...base, versionId: "version-2", estimateId: "estimate-2", estimateNumber: "KP-2" },
      { ...base, versionId: "version-3", estimateId: "estimate-3", estimateNumber: "KP-3", versionStatus: "sent", estimateLifecycleStatus: "sent", sentAt: "2026-08-28T10:00:00Z", lifecycleExpiresAt: "2026-09-20T10:00:00Z", readyDocumentId: "document-3" },
    ]);
    const result = await new PartnerSalesWorkspaceService(repo).listEstimateOpportunities(companyId, userId, allowed);

    expect(repo.listCurrent).toHaveBeenCalledWith(companyId, userId, 6);
    expect(result).toEqual([
      expect.objectContaining({ id: "accepted_ready_to_order:version-1", type: "accepted_ready_to_order", priority: 2, amount: 38400, currency: "MDL", customerName: "Client SRL", href: "/cabinet/estimates/estimate-1#estimate-order-conversion" }),
      expect.objectContaining({ id: "ready_to_send:version-2", type: "ready_to_send", priority: 3, href: "/cabinet/estimates/estimate-2" }),
      expect.objectContaining({ id: "awaiting_customer:version-3", type: "awaiting_customer", priority: 4, followUpState: "sent", action: "resend", href: "/cabinet/estimates/estimate-3?proposalAction=resend&version=version-3#estimate-order-conversion" }),
    ]);
  });

  it("derives one resume-checkout action from accepted-version conversion and complete product quantities", async () => {
    const result = await list([accepted({ cartConversions: [conversion()] })]);

    expect(result).toEqual([
      expect.objectContaining({ id: "resume_checkout:version-1", type: "resume_checkout", priority: 1, href: "/cabinet/cart" }),
    ]);
    expect(result.some((item) => item.type === "accepted_ready_to_order")).toBe(false);
  });

  it("requires deterministic accepted-version identity and never substitutes a request key or another version", async () => {
    const wrongVersion = conversion({ versionId: "version-other", requestKey: "version-1" });
    await expect(list([accepted({ cartConversions: [wrongVersion] })])).resolves.toEqual([
      expect.objectContaining({ type: "accepted_ready_to_order" }),
    ]);
    await expect(list([accepted({ acceptedVersionId: "version-newer", cartConversions: [conversion()] })])).resolves.toEqual([]);
  });

  it("preserves unrelated cart products while proving every accepted product requirement", async () => {
    const linked = conversion({
      cart: {
        ...conversion().cart!,
        items: [{ productId: "unrelated", quantity: 9 }, { productId: "product-1", quantity: 3 }],
      },
    });
    await expect(list([accepted({ cartConversions: [linked] })])).resolves.toEqual([
      expect.objectContaining({ type: "resume_checkout", href: "/cabinet/cart" }),
    ]);
  });

  it("supports two accepted Estimates linked to the same active cart without duplicating either Estimate", async () => {
    const first = accepted({ cartConversions: [conversion()] });
    const second = accepted({
      versionId: "version-2", acceptedVersionId: "version-2", estimateId: "estimate-2", estimateNumber: "KP-2", amount: 50000,
      productRequirements: [{ productId: "product-2", quantity: 1 }],
      cartConversions: [conversion({
        versionId: "version-2",
        requestKey: "request-2",
        cart: { ...conversion().cart!, items: [{ productId: "product-1", quantity: 2 }, { productId: "product-2", quantity: 1 }] },
      })],
    });

    const result = await list([first, second]);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(["resume_checkout:version-2", "resume_checkout:version-1"]);
    expect(new Set(result.map((item) => item.href))).toEqual(new Set(["/cabinet/cart"]));
  });

  it.each([
    ["missing cart", conversion({ cart: null })],
    ["replaced cart", conversion({ cart: { ...conversion().cart!, id: "old-cart", status: "abandoned" } })],
    ["cleared cart", conversion({ cart: { ...conversion().cart!, items: [] } })],
    ["reduced accepted quantity", conversion({ cart: { ...conversion().cart!, items: [{ productId: "product-1", quantity: 1 }] } })],
  ])("does not render a broken action for %s", async (_scenario, evidence) => {
    await expect(list([accepted({ cartConversions: [evidence] })])).resolves.toEqual([]);
  });

  it.each([
    ["another user conversion", conversion({ createdBy: "user-2", cart: null })],
    ["another user cart", conversion({ cart: { ...conversion().cart!, createdBy: "user-2" } })],
    ["another company cart", conversion({ cart: { ...conversion().cart!, companyId: "company-2" } })],
  ])("fails closed for %s without exposing a resume action", async (_scenario, evidence) => {
    await expect(list([accepted({ cartConversions: [evidence] })])).resolves.toEqual([]);
  });

  it.each(["draft", "sent", "rejected", "expired", "converted_to_order"] as const)(
    "does not project accepted-order work from Estimate lifecycle %s",
    async (estimateLifecycleStatus) => {
      await expect(list([accepted({ estimateLifecycleStatus, cartConversions: [conversion()] })])).resolves.toEqual([]);
    },
  );

  it("removes resume checkout when qualifying confirmed-order truth advances the lifecycle", async () => {
    await expect(list([accepted({ cartConversions: [conversion()] })])).resolves.toEqual([expect.objectContaining({ type: "resume_checkout" })]);
    await expect(list([accepted({ estimateLifecycleStatus: "converted_to_order", cartConversions: [conversion()] })])).resolves.toEqual([]);
  });

  it("fails closed on view, Estimate conversion, and cart/order permissions", async () => {
    const repo = repository([accepted({ cartConversions: [conversion()] })]);
    const service = new PartnerSalesWorkspaceService(repo);

    await expect(service.listEstimateOpportunities(companyId, userId, { ...allowed, canView: false })).resolves.toEqual([]);
    expect(repo.listCurrent).not.toHaveBeenCalled();
    await expect(service.listEstimateOpportunities(companyId, userId, { ...allowed, canConvert: false })).resolves.toEqual([]);
    await expect(service.listEstimateOpportunities(companyId, userId, { ...allowed, canManageOrders: false })).resolves.toEqual([]);
    await expect(service.listEstimateOpportunities(companyId, userId, { ...allowed, canSend: false })).resolves.toEqual([
      expect.objectContaining({ type: "resume_checkout" }),
    ]);
  });

  it("keeps only the latest version and never revives accepted work after a restored draft", async () => {
    const restoredDraft = { ...base, versionId: "version-2", createdAt: "2026-09-03T10:00:00Z", readyDocumentId: null };
    await expect(list([restoredDraft, accepted({ createdAt: "2026-09-02T10:00:00Z", cartConversions: [conversion()] })])).resolves.toEqual([]);
  });

  it("derives opened and not-opened context only from the latest governed email delivery", async () => {
    const sent = { ...base, versionStatus: "sent" as const, estimateLifecycleStatus: "sent" as const, sentAt: "2026-09-01T10:00:00Z", lifecycleExpiresAt: "2026-09-20T10:00:00Z", readyDocumentId: "document-1" };
    const delivery = { status: "sent" as const, sentAt: "2026-09-01T10:00:05Z", openedAt: null, expiresAt: "2026-09-15T10:00:05Z", response: null, createdAt: "2026-09-01T10:00:00Z" };

    await expect(list([{ ...sent, latestDelivery: delivery }])).resolves.toEqual([
      expect.objectContaining({ followUpState: "sent_not_opened", action: "resend", customerName: "Client SRL", amount: 38400 }),
    ]);
    await expect(list([{ ...sent, latestDelivery: { ...delivery, openedAt: "2026-09-02T08:00:00Z" } }])).resolves.toEqual([
      expect.objectContaining({ followUpState: "sent_opened_no_response", action: "resend" }),
    ]);
    await expect(list([{ ...sent, latestDelivery: { ...delivery, status: "failed", openedAt: null } }])).resolves.toEqual([
      expect.objectContaining({ followUpState: "sent" }),
    ]);
  });

  it("routes expired sent proposals to governed update instead of resending an immutable version", async () => {
    const service = new PartnerSalesWorkspaceService(repository([{ ...base, versionStatus: "sent", estimateLifecycleStatus: "expired", sentAt: "2026-08-10T10:00:00Z", lifecycleExpiresAt: "2026-08-24T10:00:00Z", readyDocumentId: "document-1" }]));
    await expect(service.listEstimateOpportunities(companyId, userId, allowed)).resolves.toEqual([
      expect.objectContaining({ followUpState: "expired_sent", action: "update", href: "/cabinet/estimates/estimate-1#estimate-order-conversion" }),
    ]);
  });

  it("uses review rather than resend when the partner lacks send permission", async () => {
    const sent = { ...base, versionStatus: "sent" as const, estimateLifecycleStatus: "sent" as const, sentAt: "2026-09-01T10:00:00Z", lifecycleExpiresAt: "2026-09-20T10:00:00Z", readyDocumentId: "document-1" };
    await expect(list([sent], { ...allowed, canSend: false })).resolves.toEqual([
      expect.objectContaining({ type: "awaiting_customer", action: "review", href: "/cabinet/estimates/estimate-1#estimate-order-conversion" }),
    ]);
  });

  it("ranks expired, opened, not-opened, then channel-unknown awaiting work deterministically", async () => {
    const delivery = { status: "sent" as const, sentAt: "2026-09-01T10:00:05Z", openedAt: null, expiresAt: "2026-09-15T10:00:05Z", response: null, createdAt: "2026-09-01T10:00:00Z" };
    const sent = { ...base, versionStatus: "sent" as const, estimateLifecycleStatus: "sent" as const, sentAt: "2026-09-01T10:00:00Z", lifecycleExpiresAt: "2026-09-20T10:00:00Z", readyDocumentId: "document-1" };
    const rows = [
      { ...sent, versionId: "unknown", estimateId: "unknown", latestDelivery: null },
      { ...sent, versionId: "not-opened", estimateId: "not-opened", latestDelivery: delivery },
      { ...sent, versionId: "opened", estimateId: "opened", latestDelivery: { ...delivery, openedAt: "2026-09-02T08:00:00Z" } },
      { ...sent, versionId: "expired", estimateId: "expired", estimateLifecycleStatus: "expired" as const, lifecycleExpiresAt: "2026-08-20T10:00:00Z" },
    ];
    await expect(list(rows)).resolves.toEqual([
      expect.objectContaining({ versionId: "expired" }),
      expect.objectContaining({ versionId: "opened" }),
      expect.objectContaining({ versionId: "not-opened" }),
      expect.objectContaining({ versionId: "unknown" }),
    ]);
  });

  it.each(["accepted", "rejected"] as const)("never revives %s as awaiting follow-up", async (versionStatus) => {
    await expect(list([{ ...base, versionStatus, estimateLifecycleStatus: versionStatus, sentAt: "2026-09-01T10:00:00Z" }])).resolves.toEqual([]);
  });

  it("ranks resume checkout closest to revenue, then value, and keeps six deterministic opportunities", async () => {
    const rows = [
      accepted({ versionId: "resume-low", estimateId: "estimate-resume-low", acceptedVersionId: "resume-low", amount: 1000, cartConversions: [conversion({ versionId: "resume-low" })] }),
      accepted({ versionId: "resume-high", estimateId: "estimate-resume-high", acceptedVersionId: "resume-high", amount: 5000, cartConversions: [conversion({ versionId: "resume-high" })] }),
      accepted({ versionId: "accepted-high", estimateId: "estimate-accepted", acceptedVersionId: "accepted-high", amount: 9000 }),
      ...Array.from({ length: 7 }, (_, index) => ({ ...base, versionId: `ready-${index}`, estimateId: `ready-estimate-${index}`, amount: 8000 - index })),
    ];
    const result = await list(rows, allowed, 6);

    expect(result).toHaveLength(6);
    expect(result.slice(0, 3).map((item) => item.id)).toEqual([
      "resume_checkout:resume-high",
      "resume_checkout:resume-low",
      "accepted_ready_to_order:accepted-high",
    ]);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });

  it("excludes archived Estimates even when accepted lifecycle fields still look actionable", async () => {
    await expect(list([accepted({ estimateStatus: "archived", cartConversions: [conversion()] })])).resolves.toEqual([]);
  });
});
