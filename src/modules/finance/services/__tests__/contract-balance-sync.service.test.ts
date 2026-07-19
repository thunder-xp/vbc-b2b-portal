import { describe, expect, it, vi } from "vitest";

import type { FinanceProvider } from "../../../integration/contracts";
import type { FinanceRepository } from "../../repositories";
import { ContractBalanceSyncService } from "../finance.service";

describe("ContractBalanceSyncService", () => {
  it("publishes one atomic company snapshot and preserves signed balances", async () => {
    const repository = repo();
    repository.publishContractBalanceSnapshotV2 = vi.fn().mockResolvedValue(2);
    const provider = { fetchContractBalances: vi.fn().mockResolvedValue({ items: [item("100"), item("-25")], nextCursor: null, diagnostics: diagnostics(2) }) } as unknown as FinanceProvider;
    const result = await new ContractBalanceSyncService(repository, provider).synchronize({ companyId: "company", counterpartyRef: "11111111-1111-1111-1111-111111111111", organizationRef: "22222222-2222-2222-2222-222222222222", trigger: "scheduled", actorUserId: null });
    expect(result.published).toBe(2);
    expect(repository.publishContractBalanceSnapshotV2).toHaveBeenCalledOnce();
    expect((repository.publishContractBalanceSnapshotV2 as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].rows.map((row: { signedBalance: number }) => row.signedBalance)).toEqual([100, -25]);
  });

  it("does not publish or erase the previous snapshot when the provider fails", async () => {
    const repository = repo();
    const provider = { fetchContractBalances: vi.fn().mockRejectedValue(new Error("1C unavailable")) } as unknown as FinanceProvider;
    await expect(new ContractBalanceSyncService(repository, provider).synchronize({ companyId: "company", counterpartyRef: "11111111-1111-1111-1111-111111111111", organizationRef: "22222222-2222-2222-2222-222222222222", trigger: "scheduled", actorUserId: null })).rejects.toThrow("1C unavailable");
    expect(repository.publishContractBalanceSnapshotV2).not.toHaveBeenCalled();
  });
});

function item(signedBalance: string) {
  return { contractReference: { providerCode: "one-c", externalId: crypto.randomUUID(), externalType: "contract" }, contractNumber: "NS", contractName: "NS", currencyReference: { providerCode: "one-c", externalId: crypto.randomUUID(), externalType: "currency" }, currencyCode: "MDL", signedBalance: Number(signedBalance), sourceVersion: null, synchronizedAt: new Date().toISOString() };
}

function diagnostics(rawBalanceCount: number) {
  return { rawBalanceCount, zeroBalanceCount: 0, invalidBalanceCount: 0, missingContractCount: 0, deletedContractCount: 0, inactiveContractCount: 0, wrongCounterpartyCount: 0, wrongOrganizationCount: 0, wrongContractTypeCount: 0, missingCurrencyCount: 0, deletedCurrencyCount: 0, oneCCallCount: 3 };
}

function repo(): FinanceRepository {
  return { canRunFinanceSync: vi.fn(), listActiveContractBalances: vi.fn(), getOverviewData: vi.fn(), getSyncCompany: vi.fn(), listSyncCompanies: vi.fn(), publishContractBalanceSnapshot: vi.fn(), publishContractBalanceSnapshotV2: vi.fn(), recordSyncResult: vi.fn() };
}
