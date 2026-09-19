import { describe, expect, it, vi } from "vitest";

import type { FinalCustomerRepository } from "../repository";
import { FinalCustomerAccountService } from "../service";

function repository(): FinalCustomerRepository {
  return {
    findAccountByAuthUser: vi.fn(async () => null),
    findDisplayName: vi.fn(async () => null), listOrders: vi.fn(async () => []), updateProfile: vi.fn(async () => undefined),
    getCommandCenter: vi.fn(async () => ({ displayName: null, latestOrder: null, recentPurchases: [], equipmentCount: 0, documentCount: 0, latestRequest: null, serviceNeedsInfoCount: 0, activeServiceRequestCount: 0, attentionItems: [] })),
    openAttention: vi.fn(async () => "/account/orders/11111111-1111-4111-8111-111111111111"),
    findOrder: vi.fn(async () => null), listConfirmedPurchases: vi.fn(async () => []), findPurchase: vi.fn(async () => null),
    listCurrentProducts: vi.fn(async () => []), listProductDocuments: vi.fn(async () => []),
    listServiceRequests: vi.fn(async () => []), findServiceRequest: vi.fn(async () => null),
    createServiceRequest: vi.fn(async () => { throw new Error("unused"); }), cancelServiceRequest: vi.fn(async () => undefined),
    listAdminServiceRequests: vi.fn(async () => []), findAdminServiceRequest: vi.fn(async () => null),
    addCustomerServiceReply: vi.fn(async () => "message"), updateAdminServiceRequest: vi.fn(async () => ({ messageId: null, eventId: null, eventCode: null })),
    addServiceAttachment: vi.fn(async () => "attachment"), listServiceNotifications: vi.fn(async () => []), markServiceNotificationRead: vi.fn(async () => undefined),
  };
}

describe("Final Customer account service", () => {
  it("reads an already authorized account without any creation surface", async () => {
    const repo = repository();
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    vi.mocked(repo.findAccountByAuthUser).mockResolvedValue(account);
    await expect(new FinalCustomerAccountService(repo).findAuthenticatedAccount("user")).resolves.toEqual(account);
    expect(repo.findAccountByAuthUser).toHaveBeenCalledOnce();
  });

  it("projects purchases only through the repository's confirmed-payment boundary and batches current products", async () => {
    const repo = repository();
    vi.mocked(repo.listConfirmedPurchases).mockResolvedValue([{
      id: "line", lineNumber: 1, publicProductId: "public-product", sku: "100077", name: "Camera", slug: "camera", imageUrl: null,
      quantity: 1, unitCode: "piece", unitPrice: 100, lineTotal: 100, currency: "MDL", orderId: "order", orderNumber: "R-2026-000001", purchasedAt: "2026-09-15T00:00:00Z", currentProduct: null,
    }]);
    vi.mocked(repo.listCurrentProducts).mockResolvedValue([{ publicProductId: "public-product", sourceProductId: "source", slug: "camera", name: "Camera", price: 120, currency: "MDL", availability: "in_stock", imageUrl: null }]);
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    const result = await new FinalCustomerAccountService(repo).purchases(account);
    expect(repo.listConfirmedPurchases).toHaveBeenCalledWith("identity", 20, 0);
    expect(repo.listCurrentProducts).toHaveBeenCalledWith(["public-product"]);
    expect(result[0].currentProduct?.price).toBe(120);
  });

  it("attaches factual document counts with one bounded document read", async () => {
    const repo = repository();
    vi.mocked(repo.listConfirmedPurchases).mockResolvedValue([{
      id: "line", lineNumber: 1, publicProductId: "public-product", sku: "100077", name: "Camera", slug: "camera", imageUrl: null,
      quantity: 1, unitCode: "piece", unitPrice: 100, lineTotal: 100, currency: "MDL", orderId: "11111111-1111-4111-8111-111111111111", orderNumber: "R-1", purchasedAt: "2026-09-15T00:00:00Z", currentProduct: null,
    }]);
    vi.mocked(repo.listCurrentProducts).mockResolvedValue([{ publicProductId: "public-product", sourceProductId: "source-product", slug: "camera", name: "Camera", price: 120, currency: "MDL", availability: "in_stock", imageUrl: null }]);
    vi.mocked(repo.listProductDocuments).mockResolvedValue([
      { id: "document-1", productId: "source-product", title: "Manual", type: "manual", url: "https://example.test/manual.pdf" },
      { id: "document-2", productId: "source-product", title: "Datasheet", type: "datasheet", url: "https://example.test/datasheet.pdf" },
    ]);
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;

    const result = await new FinalCustomerAccountService(repo).purchaseWorkspace(account);

    expect(repo.listProductDocuments).toHaveBeenCalledOnce();
    expect(repo.listProductDocuments).toHaveBeenCalledWith(["source-product"]);
    expect(result[0]?.documentCount).toBe(2);
  });

  it("groups documents by owned order and product without per-line reads", async () => {
    const repo = repository();
    const orderId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(repo.listConfirmedPurchases).mockResolvedValue([{
      id: "line", lineNumber: 1, publicProductId: "public-product", sku: "100077", name: "Camera", slug: "camera", imageUrl: null,
      quantity: 1, unitCode: "piece", unitPrice: 100, lineTotal: 100, currency: "MDL", orderId, orderNumber: "R-1", purchasedAt: "2026-09-15T00:00:00Z", currentProduct: null,
    }]);
    vi.mocked(repo.listCurrentProducts).mockResolvedValue([{ publicProductId: "public-product", sourceProductId: "source-product", slug: "camera", name: "Camera", price: 120, currency: "MDL", availability: "in_stock", imageUrl: null }]);
    vi.mocked(repo.listProductDocuments).mockResolvedValue([{ id: "document", productId: "source-product", title: "Manual", type: "manual", url: "https://example.test/manual.pdf" }]);
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;

    const result = await new FinalCustomerAccountService(repo).documentGroups(account, orderId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ orderId, products: [{ lineId: "line", documents: [{ id: "document" }] }] });
    expect(repo.listProductDocuments).toHaveBeenCalledOnce();
    expect(await new FinalCustomerAccountService(repo).documentGroups(account, "invalid")).toEqual([]);
    expect(repo.listConfirmedPurchases).toHaveBeenCalledOnce();
  });

  it("adds effective payment truth to owned orders with one bounded batch", async () => {
    const repo = repository();
    const order = { id: "11111111-1111-4111-8111-111111111111", number: "R-2026-000001", status: "confirmed", createdAt: "2026-09-15T00:00:00Z", total: 100, currency: "MDL", itemCount: 1, itemSummary: ["Camera"], paidAt: "2026-09-15T01:00:00Z", paymentState: "PAID" as const };
    vi.mocked(repo.listOrders).mockResolvedValue([order]);
    const paymentStateReader = { listOrderPaymentStates: vi.fn().mockResolvedValue([{ retailOrderId: order.id, orderNumber: order.number, paymentAttemptId: "22222222-2222-4222-8222-222222222222", provider: "maib" as const, attemptStatus: "paid" as const, paymentState: "REFUNDED" as const, amount: "100.00", currency: "MDL", providerStatus: "Refunded", providerCheckoutId: null, providerPaymentId: null, providerRrn: null, failureCode: null, paymentCreatedAt: null, paymentConfirmedAt: null, refundId: null, refundStatus: "refunded" as const, refundProviderStatus: "Accepted", providerRefundId: null, refundFailureCode: null, refundRequestedAt: null, refundConfirmedAt: null, remainingRefundable: "0.00" }]) };
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    const result = await new FinalCustomerAccountService(repo, paymentStateReader).listOrders(account);
    expect(result[0]?.paymentState).toBe("REFUNDED");
    expect(paymentStateReader.listOrderPaymentStates).toHaveBeenCalledWith([order.id]);
  });

  it("enriches owned order lines with current products in one bounded batch", async () => {
    const repo = repository();
    const orderId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(repo.findOrder).mockResolvedValue({
      id: orderId, number: "R-2026-000001", status: "confirmed", createdAt: "2026-09-15T00:00:00Z",
      total: 100, currency: "MDL", itemCount: 1, itemSummary: ["Camera"], paidAt: "2026-09-15T01:00:00Z", paymentState: "PAID",
      deliveryAddress: {}, events: [], lines: [{ id: "line", lineNumber: 1, publicProductId: "public-product", sku: "100077", name: "Camera", slug: "camera", imageUrl: null, quantity: 1, unitCode: "piece", unitPrice: 100, lineTotal: 100, currency: "MDL", currentProduct: null }],
    });
    vi.mocked(repo.listCurrentProducts).mockResolvedValue([{ publicProductId: "public-product", sourceProductId: "source", slug: "camera", name: "Camera", price: 120, currency: "MDL", availability: "in_stock", imageUrl: null }]);
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    const result = await new FinalCustomerAccountService(repo).orderDetail(account, orderId);
    expect(repo.listCurrentProducts).toHaveBeenCalledOnce();
    expect(repo.listCurrentProducts).toHaveBeenCalledWith(["public-product"]);
    expect(result?.lines[0]?.currentProduct?.slug).toBe("camera");
  });

  it("rejects cross-customer service references before mutation", async () => {
    const repo = repository();
    vi.mocked(repo.findOrder).mockResolvedValue(null);
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    await expect(new FinalCustomerAccountService(repo).createServiceRequest(account, { type: "ORDER_QUESTION", subject: "Order question", description: "Please review this order", preferredContact: "PHONE", orderId: "11111111-1111-4111-8111-111111111111", orderLineId: "" })).rejects.toThrow("INVALID_SERVICE_REFERENCE");
    expect(repo.createServiceRequest).not.toHaveBeenCalled();
  });

  it("does not expose commerce history while identity review is required", async () => {
    const repo = repository();
    const account = { id: "account", authUserId: "user", customerIdentityId: null, status: "IDENTITY_REVIEW_REQUIRED", identityResolutionStatus: "AMBIGUOUS", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    expect(await new FinalCustomerAccountService(repo).purchases(account)).toEqual([]);
    expect(repo.listConfirmedPurchases).not.toHaveBeenCalled();
  });

  it("loads the command center through one bounded aggregate", async () => {
    const repo = repository();
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    await new FinalCustomerAccountService(repo).commandCenter(account);
    expect(repo.getCommandCenter).toHaveBeenCalledOnce();
    expect(repo.listOrders).not.toHaveBeenCalled();
    expect(repo.listConfirmedPurchases).not.toHaveBeenCalled();
    expect(repo.listServiceRequests).not.toHaveBeenCalled();
  });

  it("returns NEED_INFO to review when a customer reply is accepted by the governed repository boundary", async () => {
    const repo = repository();
    vi.mocked(repo.findServiceRequest).mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", number: "CR-1", type: "OTHER", subject: "Help", description: "Need some help", preferredContact: "PHONE", status: "NEED_INFO", orderId: null, orderLineId: null, createdAt: "now", updatedAt: "now", version: 2, messages: [], attachments: [], timeline: [] });
    const account = { id: "account", authUserId: "user", customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: "MATCHED", displayName: null, email: null, createdAt: "now", lastLoginAt: "now" } as const;
    await new FinalCustomerAccountService(repo).replyToServiceRequest(account, "11111111-1111-4111-8111-111111111111", 2, "Requested details");
    expect(repo.addCustomerServiceReply).toHaveBeenCalledWith(expect.objectContaining({ customerIdentityId: "identity", expectedVersion: 2 }));
  });

  it("requires a customer-visible explanation for NEED_INFO", async () => {
    const repo = repository();
    await expect(new FinalCustomerAccountService(repo).updateAdminServiceRequest({ requestId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0, status: "NEED_INFO", customerReply: "", internalNote: "private", actorUserId: "admin" })).rejects.toThrow("NEED_INFO_EXPLANATION_REQUIRED");
    expect(repo.updateAdminServiceRequest).not.toHaveBeenCalled();
  });
});
