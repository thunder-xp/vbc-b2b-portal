import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { FinanceProvider } from "../../integration/contracts";
import type { FinanceRepository } from "../repositories";
import type { ContractBalanceCurrencySummary, ContractBalanceView, FinanceOverview } from "../types";
import { reconcilePaymentObligations } from "./payment-obligation.service";

export const FINANCE_VIEW_PERMISSION = "finance.view_company";
const FINANCE_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export class DefaultFinanceService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
  ) {}

  async getOverview(userId: string): Promise<FinanceOverview> {
    const companyId = await this.getAuthorizedCompanyId(userId);
    const { balances: rows, obligations, unavailableCount, syncState } = await this.repository.getOverviewData(companyId);
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
      paymentCalendar: buildPaymentCalendar(obligations, unavailableCount, syncState?.lastSuccessAt ?? synchronizedAt, Date.now()),
    };
  }

  async getAuthorizedCompanyId(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((row) => row.status === MembershipStatus.Active);
    if (!membership) throw new NotFoundError();
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership.companyId);
    const companyId = context.company.id;
    await this.permissionService.ensurePermission(userId, companyId, FINANCE_VIEW_PERMISSION);
    return companyId;
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
  }): Promise<{
    received: number;
    published: number;
    obligationsPublished: number;
    exclusionsPublished: number;
    synchronizedAt: string;
    durationMs: number;
    publicationDurationMs: number;
    diagnostics: NonNullable<Awaited<ReturnType<FinanceProvider["fetchContractBalances"]>>["diagnostics"]>;
    obligationDiagnostics: Awaited<ReturnType<FinanceProvider["fetchPaymentObligations"]>>["diagnostics"];
  }> {
    const startedAt = performance.now();
    const synchronizedAt = input.synchronizedAt ?? new Date().toISOString();
    const request = {
      counterpartyReference: reference(input.counterpartyRef, "counterparty"),
      organizationReference: reference(input.organizationRef, "organization"),
      synchronizedAt,
    };
    const [page, obligationPage] = await Promise.all([
      this.provider.fetchContractBalances(request),
      this.provider.fetchPaymentObligations(request),
    ]);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const diagnostics = page.diagnostics ?? emptyDiagnostics(page.items.length);
    const publicationStartedAt = performance.now();
    const reconciled = reconcilePaymentObligations(obligationPage.items, synchronizedAt);
    const publication = await this.repository.publishFinanceSnapshot({
      companyId: input.companyId,
      counterpartyRef: input.counterpartyRef,
      synchronizedAt,
      rows: page.items,
      obligations: reconciled.obligations,
      exclusions: reconciled.exclusions,
      durationMs,
      balanceDiagnostics: diagnostics,
      obligationDiagnostics: obligationPage.diagnostics,
      trigger: input.trigger,
      actorUserId: input.actorUserId,
    });
    const publicationDurationMs = Math.max(0, Math.round(performance.now() - publicationStartedAt));
    return {
      received: diagnostics.rawBalanceCount,
      published: publication.balances,
      obligationsPublished: publication.obligations,
      exclusionsPublished: publication.exclusions,
      synchronizedAt,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      publicationDurationMs,
      diagnostics,
      obligationDiagnostics: obligationPage.diagnostics,
    };
  }
}

export class FinanceOperationsService {
  constructor(private readonly repository: FinanceRepository) {}
  getOperations() { return this.repository.getAdminFinanceOperations(); }
}

function buildPaymentCalendar(
  obligations: import("../types").PartnerPaymentObligation[],
  unavailableCount: number,
  synchronizedAt: string | null,
  now: number,
): import("../types").PaymentCalendarView {
  const today = financeBusinessDate(new Date(now));
  const items = obligations
    .filter((row) => row.reconciliationStatus === "READY")
    .map((row) => {
      const daysFromDue = calendarDayDistance(today, row.dueDate);
      return {
        ...row,
        daysFromDue,
        timing: row.paymentStatus === "SETTLED" ? "settled" as const
          : daysFromDue < 0 ? "overdue" as const
            : daysFromDue === 0 ? "today" as const
              : daysFromDue <= 30 ? "upcoming" as const : "later" as const,
      };
    })
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.orderNumber.localeCompare(right.orderNumber));
  const current = items.filter((row) => row.paymentStatus !== "SETTLED");
  const settled = items.filter((row) => row.paymentStatus === "SETTLED").sort((left, right) => right.dueDate.localeCompare(left.dueDate)).slice(0, 20);
  const currencies = new Map<string, { outstanding: Decimal; overdue: Decimal; next: typeof current[number] | null }>();
  for (const item of current) {
    const value = currencies.get(item.currency) ?? { outstanding: new Decimal(0), overdue: new Decimal(0), next: null };
    value.outstanding = value.outstanding.plus(item.remainingAmount);
    if (item.daysFromDue < 0) value.overdue = value.overdue.plus(item.remainingAmount);
    if (!value.next || item.dueDate < value.next.dueDate) value.next = item;
    currencies.set(item.currency, value);
  }
  const fresh = Boolean(synchronizedAt && now - Date.parse(synchronizedAt) <= FINANCE_STALE_AFTER_MS);
  return {
    summaries: [...currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, value]) => ({
      currency,
      outstanding: value.outstanding.toFixed(2),
      overdue: value.overdue.toFixed(2),
      nextPaymentAmount: value.next?.remainingAmount ?? null,
      nextPaymentDueDate: value.next?.dueDate ?? null,
    })),
    current,
    settled,
    freshness: fresh ? "FINANCE_DATA_FRESH" : "FINANCE_DATA_STALE",
    synchronizedAt,
    unavailableCount,
  };
}

function calendarDayDistance(today: string, dueDate: string): number {
  return Math.round((Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function financeBusinessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Chisinau",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
