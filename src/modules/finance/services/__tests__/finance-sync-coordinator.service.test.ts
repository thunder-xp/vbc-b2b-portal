import { describe, expect, it, vi } from "vitest";

import type { FinanceRepository } from "../../repositories";
import { FinanceSyncCoordinator, type FinanceCompanySyncLock } from "../finance-sync-coordinator.service";
import type { ContractBalanceSyncService } from "../finance.service";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const ALERT_REF = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const SLAV_REF = "60d2f512-7637-11ed-8e85-7239d3b7bd5c";

describe("FinanceSyncCoordinator", () => {
  it("synchronizes ALERT-SS and SLAV-TRADE independently", async () => {
    const repository = repo([company(COMPANY_A, "ALERT-SS", ALERT_REF), company(COMPANY_B, "SLAV-TRADE", SLAV_REF)]);
    const synchronize = vi.fn()
      .mockResolvedValueOnce(syncResult(2))
      .mockResolvedValueOnce(syncResult(4));
    const result = await coordinator(repository, synchronize).synchronizeCompanies({ trigger: "scheduled", actorUserId: null });

    expect(result.succeeded).toBe(2);
    expect(result.publishedRows).toBe(6);
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(synchronize.mock.calls[1]?.[0]).toMatchObject({ companyId: COMPANY_B, counterpartyRef: SLAV_REF });
  });

  it("continues with another company after one provider failure and preserves publication", async () => {
    const repository = repo([company(COMPANY_A, "ALERT-SS", ALERT_REF, 2), company(COMPANY_B, "SLAV-TRADE", SLAV_REF)]);
    const synchronize = vi.fn().mockRejectedValueOnce(new Error("provider failed")).mockResolvedValueOnce(syncResult(4));
    const result = await coordinator(repository, synchronize).synchronizeCompanies({ trigger: "scheduled", actorUserId: null });

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(repository.recordSyncResult).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY_A, status: "failed" }));
    expect(repository.publishContractBalanceSnapshotV2).not.toHaveBeenCalled();
  });

  it("classifies missing counterparty mapping without calling 1C", async () => {
    const repository = repo([company(COMPANY_A, "Missing", "not-a-guid")]);
    const synchronize = vi.fn();
    const result = await coordinator(repository, synchronize).synchronizeCompanies({ trigger: "scheduled", actorUserId: null });

    expect(result.missingMappings).toBe(1);
    expect(synchronize).not.toHaveBeenCalled();
    expect(repository.recordSyncResult).toHaveBeenCalledWith(expect.objectContaining({ status: "mapping_missing" }));
  });

  it("classifies a missing organization mapping without calling 1C", async () => {
    const repository = repo([company(COMPANY_A, "ALERT-SS", ALERT_REF)]);
    const synchronize = vi.fn();
    const lock = { acquire: vi.fn(), release: vi.fn() } satisfies FinanceCompanySyncLock;
    const service = new FinanceSyncCoordinator(repository, { synchronize } as unknown as ContractBalanceSyncService, lock, Date.now, "missing");
    const result = await service.synchronizeCompanies({ trigger: "scheduled", actorUserId: null });
    expect(result.missingMappings).toBe(1);
    expect(result.companies[0]?.errorCode).toBe("organization_mapping_missing");
    expect(synchronize).not.toHaveBeenCalled();
  });

  it("enforces a distributed lock per company", async () => {
    const repository = repo([company(COMPANY_A, "ALERT-SS", ALERT_REF)]);
    const synchronize = vi.fn();
    const lock = { acquire: vi.fn().mockResolvedValue("locked"), release: vi.fn() } satisfies FinanceCompanySyncLock;
    const result = await new FinanceSyncCoordinator(repository, { synchronize } as unknown as ContractBalanceSyncService, lock).synchronizeCompanies({ trigger: "scheduled", actorUserId: null });

    expect(result.locked).toBe(1);
    expect(lock.acquire).toHaveBeenCalledWith(`finance_contract_balance:${COMPANY_A}`, expect.any(String), 300);
    expect(lock.release).not.toHaveBeenCalled();
  });
});

function coordinator(repository: FinanceRepository, synchronize: ReturnType<typeof vi.fn>) {
  const lock = { acquire: vi.fn().mockResolvedValue("acquired"), release: vi.fn().mockResolvedValue(undefined) } satisfies FinanceCompanySyncLock;
  return new FinanceSyncCoordinator(repository, { synchronize } as unknown as ContractBalanceSyncService, lock);
}

function company(companyId: string, companyName: string, counterpartyRef: string, activeBalanceCount = 0) {
  return { companyId, companyName, counterpartyRef, activeBalanceCount };
}

function syncResult(published: number) {
  return { received: published, published, synchronizedAt: new Date().toISOString(), durationMs: 20, publicationDurationMs: 2, diagnostics: { rawBalanceCount: published, zeroBalanceCount: 0, invalidBalanceCount: 0, missingContractCount: 0, deletedContractCount: 0, inactiveContractCount: 0, wrongCounterpartyCount: 0, wrongOrganizationCount: 0, wrongContractTypeCount: 0, missingCurrencyCount: 0, deletedCurrencyCount: 0, oneCCallCount: 3 } };
}

function repo(companies: ReturnType<typeof company>[]): FinanceRepository {
  return {
    canRunFinanceSync: vi.fn(), listActiveContractBalances: vi.fn(), getOverviewData: vi.fn(), getSyncCompany: vi.fn().mockImplementation(async (id) => companies.find((row) => row.companyId === id) ?? null),
    listSyncCompanies: vi.fn().mockResolvedValue(companies), publishContractBalanceSnapshot: vi.fn(), publishContractBalanceSnapshotV2: vi.fn(), recordSyncResult: vi.fn(),
  };
}
