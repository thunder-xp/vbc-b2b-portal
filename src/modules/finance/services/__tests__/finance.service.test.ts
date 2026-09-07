import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import type { FinanceRepository } from "../../repositories";
import { DefaultFinanceService } from "../finance.service";
import type { PartnerContractBalance } from "../../types";
import type { PartnerPaymentObligation } from "../../types";
import type { FinanceSyncState } from "../../types";

describe("DefaultFinanceService", () => {
  afterEach(() => vi.useRealTimers());
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

  it("groups the current calendar chronologically in Chisinau time and keeps currencies separate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T22:30:00Z"));
    const obligations = [
      obligation("overdue", "2026-09-06", "MDL", "100", "PARTIAL"),
      obligation("today", "2026-09-07", "MDL", "50"),
      obligation("future", "2026-09-09", "USD", "20"),
      obligation("settled", "2026-09-01", "MDL", "0", "SETTLED"),
    ];
    const service = new DefaultFinanceService(repositoryWith([], state("succeeded"), obligations), companyAccess(), { ensurePermission: vi.fn() } as unknown as PermissionService);
    const result = await service.getOverview("user");
    expect(result.paymentCalendar.freshness).toBe("FINANCE_DATA_FRESH");
    expect(result.paymentCalendar.current.map((row) => [row.id, row.timing, row.daysFromDue])).toEqual([
      ["overdue", "overdue", -1], ["today", "today", 0], ["future", "upcoming", 2],
    ]);
    expect(result.paymentCalendar.summaries).toEqual([
      { currency: "MDL", outstanding: "150.00", overdue: "100.00", nextPaymentAmount: "100", nextPaymentDueDate: "2026-09-06" },
      { currency: "USD", outstanding: "20.00", overdue: "0.00", nextPaymentAmount: "20", nextPaymentDueDate: "2026-09-09" },
    ]);
    expect(result.paymentCalendar.settled.map((row) => row.id)).toEqual(["settled"]);
  });
});

function companyAccess(): CompanyAccessService {
  return {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company", status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company" }, membership: {} }),
  } as unknown as CompanyAccessService;
}

function repositoryWith(rows: PartnerContractBalance[], syncState: FinanceSyncState | null = state("succeeded"), obligations: PartnerPaymentObligation[] = []): FinanceRepository {
  return {
    canRunFinanceSync: vi.fn(),
    listActiveContractBalances: vi.fn().mockResolvedValue(rows),
    getOverviewData: vi.fn().mockResolvedValue({ balances: rows, obligations, unavailableCount: 0, syncState }),
    getSyncCompany: vi.fn(),
    listSyncCompanies: vi.fn(),
    publishContractBalanceSnapshot: vi.fn(),
    publishContractBalanceSnapshotV2: vi.fn(),
    publishFinanceSnapshot: vi.fn(),
    getReminderDryRunInput: vi.fn(),
    listDeliveredReminderIdentities: vi.fn(),
    publishReminderDryRun: vi.fn(),
    getAdminFinanceOperations: vi.fn(),
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

function obligation(id: string, dueDate: string, currency: string, remainingAmount: string, paymentStatus: PartnerPaymentObligation["paymentStatus"] = "OPEN"): PartnerPaymentObligation {
  return {
    id, companyId: "company", oneCOrderId: crypto.randomUUID(), orderNumber: id, orderDate: "2026-09-01",
    oneCCounterpartyId: null, oneCContractId: null, oneCOrganizationId: null, scheduleLineNumber: 1,
    sourceOrderDataVersion: "v1", paymentPercent: "100", plannedAmount: paymentStatus === "PARTIAL" ? "200" : remainingAmount,
    vatAmount: "0", currency, dueDate, paymentMethod: "bank", bankAccountId: null, bankAccountName: null,
    paidAmount: paymentStatus === "PARTIAL" ? "100" : "0", remainingAmount, paymentStatus,
    settlementLastPaymentAt: null, orderPosted: true, orderDeletionMark: false, orderStatus: null,
    reconciliationStatus: "READY", unsupportedReason: null, sourceModifiedAt: null,
    sourceObservedAt: "2026-09-06T22:00:00Z", syncedAt: "2026-09-06T22:00:00Z",
  };
}
