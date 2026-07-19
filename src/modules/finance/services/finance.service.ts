import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { FinanceProvider } from "../../integration/contracts";
import type { FinanceRepository } from "../repositories";
import type { ContractBalanceCurrencySummary, ContractBalanceView, FinanceOverview } from "../types";

export const FINANCE_VIEW_PERMISSION = "finance.view_company";

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
    const rows = await this.repository.listActiveContractBalances(companyId);
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
    return { summaries, contracts, synchronizedAt };
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
  }): Promise<{ received: number; published: number; synchronizedAt: string }> {
    const synchronizedAt = input.synchronizedAt ?? new Date().toISOString();
    const page = await this.provider.fetchContractBalances({
      counterpartyReference: reference(input.counterpartyRef, "counterparty"),
      organizationReference: reference(input.organizationRef, "organization"),
      synchronizedAt,
    });
    const published = await this.repository.publishContractBalanceSnapshot({
      companyId: input.companyId,
      counterpartyRef: input.counterpartyRef,
      synchronizedAt,
      rows: page.items,
    });
    return { received: page.items.length, published, synchronizedAt };
  }
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
