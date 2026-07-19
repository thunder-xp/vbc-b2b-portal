import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { FinanceProvider } from "../../integration/contracts";
import type { FinanceRepository } from "../repositories";
import type { ContractBalanceCurrencySummary, ContractBalanceView, FinanceOverview } from "../types";

export const FINANCE_VIEW_PERMISSION = "finance.view_company";
const FINANCE_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export class DefaultFinanceService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async getOverview(userId: string): Promise<FinanceOverview> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((row) => row.status === MembershipStatus.Active);
    if (!membership) throw new NotFoundError();
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership.companyId);
    const companyId = context.company.id;
    await this.permissionService.ensurePermission(userId, companyId, FINANCE_VIEW_PERMISSION);
    const { balances: rows, syncState } = await this.repository.getOverviewData(companyId);
    const contracts = rows.flatMap((row) => {
      const signed = decimal(row.signedBalance);
      if (!signed || signed.isZero()) return [];
      return [{
        ...row,
        balanceType: signed.isPositive() ? "receivable" : "advance",
        absoluteDisplayAmount: signed.abs().toFixed(2),
      } satisfies ContractBalanceView];
    });
    const totals = new Map<string, { receivable: Decimal; advance: Decimal }>();
    for (const contract of contracts) {
      const amount = new Decimal(contract.absoluteDisplayAmount);
      const current = totals.get(contract.currencyCode) ?? { receivable: new Decimal(0), advance: new Decimal(0) };
      current[contract.balanceType] = current[contract.balanceType].plus(amount);
      totals.set(contract.currencyCode, current);
    }
    const summaries: ContractBalanceCurrencySummary[] = [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyCode, total]) => ({
        currencyCode,
        receivableTotal: total.receivable.toFixed(2),
        advanceTotal: total.advance.toFixed(2),
      }));
    const synchronizedAt = contracts.reduce<string | null>((latest, row) =>
      !latest || Date.parse(row.synchronizedAt) > Date.parse(latest) ? row.synchronizedAt : latest, null);
    const state = resolveFinanceDataState(syncState, contracts.length, Date.now());
    return {
      summaries,
      contracts,
      synchronizedAt: syncState?.lastSuccessAt ?? synchronizedAt,
      state,
      showLastConfirmedNotice: syncState?.status === "failed" && contracts.length > 0,
    };
  }
}

export class ContractBalanceSyncService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly provider: FinanceProvider,
  ) {}

  async synchronize(input: {
    companyId: string;
    counterpartyRef: string;
    organizationRef: string;
    synchronizedAt?: string;
    trigger: "manual" | "scheduled";
    actorUserId: string | null;
  }): Promise<{ received: number; published: number; synchronizedAt: string; durationMs: number; publicationDurationMs: number; diagnostics: NonNullable<Awaited<ReturnType<FinanceProvider["fetchContractBalances"]>>["diagnostics"]> }> {
    const startedAt = performance.now();
    const synchronizedAt = input.synchronizedAt ?? new Date().toISOString();
    const page = await this.provider.fetchContractBalances({
      counterpartyReference: reference(input.counterpartyRef, "counterparty"),
      organizationReference: reference(input.organizationRef, "organization"),
      synchronizedAt,
    });
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const diagnostics = page.diagnostics ?? emptyDiagnostics(page.items.length);
    const publicationStartedAt = performance.now();
    const published = await this.repository.publishContractBalanceSnapshotV2({
      companyId: input.companyId,
      counterpartyRef: input.counterpartyRef,
      synchronizedAt,
      rows: page.items,
      durationMs,
      diagnostics,
      trigger: input.trigger,
      actorUserId: input.actorUserId,
    });
    const publicationDurationMs = Math.max(0, Math.round(performance.now() - publicationStartedAt));
    return { received: diagnostics.rawBalanceCount, published, synchronizedAt, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), publicationDurationMs, diagnostics };
  }
}

function resolveFinanceDataState(syncState: import("../types").FinanceSyncState | null, contractCount: number, now: number): FinanceOverview["state"] {
  if (!syncState) return "never_synchronized";
  if (syncState.status === "mapping_missing") return "mapping_missing";
  if (syncState.status === "failed") return contractCount > 0 ? "failed_with_snapshot" : "failed_without_snapshot";
  if (!syncState.lastSuccessAt) return contractCount > 0 ? "stale" : "never_synchronized";
  if (now - Date.parse(syncState.lastSuccessAt) > FINANCE_STALE_AFTER_MS) return "stale";
  return contractCount > 0 ? "synchronized_nonzero" : "synchronized_zero";
}

function emptyDiagnostics(received: number) {
  return {
    rawBalanceCount: received, zeroBalanceCount: 0, invalidBalanceCount: 0,
    missingContractCount: 0, deletedContractCount: 0, inactiveContractCount: 0,
    wrongCounterpartyCount: 0, wrongOrganizationCount: 0, wrongContractTypeCount: 0,
    missingCurrencyCount: 0, deletedCurrencyCount: 0, oneCCallCount: 0,
  };
}

function decimal(value: string): Decimal | null {
  try {
    const result = new Decimal(value);
    return result.isFinite() ? result : null;
  } catch {
    return null;
  }
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
