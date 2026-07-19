import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import type { FinanceRepository } from "../../repositories";
import { DefaultFinanceService } from "../finance.service";
import type { PartnerContractBalance } from "../../types";
import type { FinanceSyncState } from "../../types";

describe("DefaultFinanceService", () => {
  it("separates receivables and advances by currency without netting", async () => {
    const repository = repositoryWith([
      row("a", "705425", "MDL"),
      row("b", "-12000", "MDL"),
      row("c", "4500", "USD"),
      row("d", "0", "USD"),
    ]);
    const permissionService = { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) } as unknown as PermissionService;
    const service = new DefaultFinanceService(repository, companyAccess(), permissionService);

    const result = await service.getOverview("user");

    expect(result.summaries).toEqual([
      { currencyCode: "MDL", receivableTotal: "705425.00", advanceTotal: "12000.00" },
      { currencyCode: "USD", receivableTotal: "4500.00", advanceTotal: "0.00" },
    ]);
    expect(result.contracts.map((item) => [item.balanceType, item.absoluteDisplayAmount])).toEqual([
      ["receivable", "705425.00"], ["advance", "12000.00"], ["receivable", "4500.00"],
    ]);
    expect(result.contracts[1]?.signedBalance).toBe("-12000");
    expect(permissionService.ensurePermission).toHaveBeenCalledWith("user", "company", "finance.view_company");
    expect(repository.getOverviewData).toHaveBeenCalledOnce();
    expect(repository.listActiveContractBalances).not.toHaveBeenCalled();
  });

  it.each([
    [null, [], "never_synchronized"],
    [state("succeeded"), [], "synchronized_zero"],
    [state("mapping_missing"), [], "mapping_missing"],
    [state("failed"), [], "failed_without_snapshot"],
    [state("failed"), [row("a", "10", "MDL")], "failed_with_snapshot"],
  ] as const)("distinguishes finance synchronization state", async (syncState, rows, expected) => {
    const repository = repositoryWith([...rows], syncState);
    const service = new DefaultFinanceService(repository, companyAccess(), { ensurePermission: vi.fn() } as unknown as PermissionService);
    const result = await service.getOverview("user");
    expect(result.state).toBe(expected);
    expect(result.showLastConfirmedNotice).toBe(expected === "failed_with_snapshot");
  });
});

function companyAccess(): CompanyAccessService {
  return {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company", status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company" }, membership: {} }),
  } as unknown as CompanyAccessService;
}

function repositoryWith(rows: PartnerContractBalance[], syncState: FinanceSyncState | null = state("succeeded")): FinanceRepository {
  return {
    canRunFinanceSync: vi.fn(),
    listActiveContractBalances: vi.fn().mockResolvedValue(rows),
    getOverviewData: vi.fn().mockResolvedValue({ balances: rows, syncState }),
    getSyncCompany: vi.fn(),
    listSyncCompanies: vi.fn(),
    publishContractBalanceSnapshot: vi.fn(),
    publishContractBalanceSnapshotV2: vi.fn(),
    recordSyncResult: vi.fn(),
  };
}

function state(status: FinanceSyncState["status"]): FinanceSyncState {
  const success = status === "succeeded" ? new Date().toISOString() : null;
  return { companyId: "company", status, lastAttemptAt: new Date().toISOString(), lastSuccessAt: success, lastErrorCode: status === "failed" ? "ProviderError" : null, receivedCount: 0, publishedCount: 0, excludedDeletedCount: 0, sourceVersion: null, lastDurationMs: 10 };
}

function row(id: string, signedBalance: string, currencyCode: string): PartnerContractBalance {
  return { id, companyId: "company", externalContractRef: id, contractNumber: id, contractName: id, currencyRef: currencyCode, currencyCode, signedBalance, sourceVersion: null, synchronizedAt: "2026-07-19T16:00:00.000Z" };
}
