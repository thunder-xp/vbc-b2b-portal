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
});
