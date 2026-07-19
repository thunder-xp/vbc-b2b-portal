import { describe, expect, it, vi } from "vitest";

import type { UserProfileService } from "../../../access-control/services";
import { UserStatus, UserType } from "../../../access-control/types";
import type { FinanceRepository } from "../../repositories";
import { FinanceSyncAuthorizationService } from "../finance-sync-authorization.service";

describe("FinanceSyncAuthorizationService", () => {
  it("allows an active internal user with finance.sync", async () => {
    const repository = repo(true);
    await expect(new FinanceSyncAuthorizationService(profiles(UserType.Internal), repository).ensureAllowed("user")).resolves.toBeUndefined();
  });

  it("denies partners and internal users without finance.sync", async () => {
    await expect(new FinanceSyncAuthorizationService(profiles(UserType.Partner), repo(true)).ensureAllowed("user")).rejects.toThrow();
    await expect(new FinanceSyncAuthorizationService(profiles(UserType.Internal), repo(false)).ensureAllowed("user")).rejects.toThrow();
  });
});

function profiles(userType: UserType): UserProfileService {
  return { ensureActiveUser: vi.fn().mockResolvedValue({ id: "user", email: "u@example.com", fullName: null, phone: null, status: UserStatus.Active, userType, createdAt: "", updatedAt: "" }) } as unknown as UserProfileService;
}

function repo(allowed: boolean): FinanceRepository {
  return { canRunFinanceSync: vi.fn().mockResolvedValue(allowed), listActiveContractBalances: vi.fn(), getOverviewData: vi.fn(), getSyncCompany: vi.fn(), listSyncCompanies: vi.fn(), publishContractBalanceSnapshot: vi.fn(), publishContractBalanceSnapshotV2: vi.fn(), recordSyncResult: vi.fn() };
}
