import { describe, expect, it, vi } from "vitest";

import type { CustomerIdentityResolutionService } from "@/src/modules/customer-identity";

import type { FinalCustomerRepository } from "../repository";
import type { FinalCustomerAccount } from "../types";
import { FinalCustomerAccountService, FinalCustomerAuthenticationError } from "../service";

function repository(): FinalCustomerRepository {
  return {
    findAccountByAuthUser: vi.fn(async () => null),
    createAccount: vi.fn(async (input): Promise<FinalCustomerAccount> => ({ id: "account", authUserId: input.authUserId, customerIdentityId: input.customerIdentityId, status: input.customerIdentityId ? "ACTIVE" : "IDENTITY_REVIEW_REQUIRED", identityResolutionStatus: input.resolutionStatus, displayName: null, email: null, createdAt: "now", lastLoginAt: "now" })),
    findDisplayName: vi.fn(async () => null), listOrders: vi.fn(async () => []), updateProfile: vi.fn(async () => undefined),
    getCommandCenter: vi.fn(async () => ({ displayName: null, latestOrder: null, recentPurchases: [], equipmentCount: 0, documentCount: 0, latestRequest: null })),
    findOrder: vi.fn(async () => null), listConfirmedPurchases: vi.fn(async () => []), findPurchase: vi.fn(async () => null),
    listCurrentProducts: vi.fn(async () => []), listProductDocuments: vi.fn(async () => []),
    listServiceRequests: vi.fn(async () => []), findServiceRequest: vi.fn(async () => null),
    createServiceRequest: vi.fn(async () => { throw new Error("unused"); }), cancelServiceRequest: vi.fn(async () => undefined),
    listAdminServiceRequests: vi.fn(async () => []), findAdminServiceRequest: vi.fn(async () => null), updateAdminServiceRequestStatus: vi.fn(async () => undefined),
  };
}

describe("Final Customer account service", () => {
  it.each(["MATCHED", "NEW"] as const)("links a verified phone when resolver returns %s", async (status) => {
    const repo = repository();
    const resolver = { resolve: vi.fn(async () => ({ status, reason: status === "NEW" ? "NEW_IDENTITY" : "EXACT_VERIFIED_PHONE", customerIdentityId: "identity", candidateIds: [] })) } as unknown as CustomerIdentityResolutionService;
    const service = new FinalCustomerAccountService(repo, resolver);
    const account = await service.ensureAccount({ id: "user", phone: "+37369123456", phone_confirmed_at: "now" } as never);
    expect(account).toMatchObject({ customerIdentityId: "identity", status: "ACTIVE", identityResolutionStatus: status });
    expect(resolver.resolve).toHaveBeenCalledWith(expect.objectContaining({ verifiedKeyTypes: ["PHONE"], createIfMissing: true, exposeCandidateIds: false }));
  });

  it.each(["AMBIGUOUS", "CONFLICT"] as const)("creates a restricted account without candidate traversal for %s", async (status) => {
    const repo = repository();
    const resolver = { resolve: vi.fn(async () => ({ status, reason: "MULTIPLE_MATCHES", customerIdentityId: null, candidateIds: [] })) } as unknown as CustomerIdentityResolutionService;
    const account = await new FinalCustomerAccountService(repo, resolver).ensureAccount({ id: "user", phone: "+37369123456", phone_confirmed_at: "now" } as never);
    expect(account).toMatchObject({ customerIdentityId: null, status: "IDENTITY_REVIEW_REQUIRED", identityResolutionStatus: status });
  });

  it("rejects an unverified phone principal", async () => {
    await expect(new FinalCustomerAccountService(repository()).ensureAccount({ id: "user", phone: "+37369123456", phone_confirmed_at: null } as never)).rejects.toBeInstanceOf(FinalCustomerAuthenticationError);
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
});
