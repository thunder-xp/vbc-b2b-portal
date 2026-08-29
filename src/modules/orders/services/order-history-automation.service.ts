import type { OrderProvider } from "../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../integration/dto";
import type { PartnerOrderHistoryRepository } from "../repositories";
import type { PartnerOrderHistoryService } from "./order-history.service";

const ACTIVE_ORDER_BATCH_SIZE = 25;
const ACTIVE_ORDER_CONCURRENCY = 5;
const ACTIVE_ORDER_MIN_AGE_MS = 30 * 60 * 1000;

export type ActiveOrderRefreshResult = {
  received: number;
  updated: number;
  hidden: number;
  unchanged: number;
  warnings: number;
  oneCCallCount: number;
  concurrencyLimit: number;
  durationMs: number;
};

export class PartnerOrderHistoryAutomationService {
  constructor(
    private readonly repository: PartnerOrderHistoryRepository,
    private readonly provider: OrderProvider,
    private readonly historyService: PartnerOrderHistoryService,
    private readonly now: () => number = Date.now,
  ) {}

  async refreshActiveOrders(): Promise<ActiveOrderRefreshResult> {
    const startedAt = this.now();
    if (!this.repository.listActiveRefreshCandidates || !this.repository.applyExistenceResults) throw new Error("Active-order automation repository is unavailable.");
    const candidates = await this.repository.listActiveRefreshCandidates({
      olderThan: new Date(startedAt - ACTIVE_ORDER_MIN_AGE_MS).toISOString(),
      limit: ACTIVE_ORDER_BATCH_SIZE,
    });
    if (!candidates.length) return emptyActiveResult(this.now() - startedAt);
    if (!this.provider.fetchSalesOrderHistoryByReferences || !this.provider.verifySalesOrderHistoryReferences) throw new Error("Exact active-order refresh is unavailable.");

    let updated = 0;
    let hidden = 0;
    let unchanged = 0;
    let warnings = 0;
    let oneCCallCount = 0;
    const groups = groupCandidates(candidates);
    for (const [companyKey, companyCandidates] of groups) {
      const [companyId, counterpartyRef] = companyKey.split("|");
      if (!companyId || !counterpartyRef) continue;
      const syncId = crypto.randomUUID();
      const syncedAt = new Date(this.now()).toISOString();
      const verification = await this.provider.verifySalesOrderHistoryReferences({
        partnerCompanyReference: externalReference(counterpartyRef, "counterparty"),
        orderReferences: companyCandidates.map(({ order }) => externalReference(order.external1cOrderRef, "customer-order")),
        historySyncContext: { syncId, page: 1 },
      });
      oneCCallCount += verification.requestCount;
      const currentByRef = new Map(companyCandidates.map(({ order }) => [order.external1cOrderRef.toLowerCase(), order]));
      const changedReferences = verification.results.filter((result) => {
        if (result.status !== "exists" || !result.header) return false;
        const current = currentByRef.get(result.reference.externalId.toLowerCase());
        if (!current) return false;
        if (current.oneCSourceVersion === result.header.sourceVersion && current.partnerVisible && !current.oneCDeletionMark) {
          unchanged += 1;
          return false;
        }
        return true;
      });
      const changed: SalesOrderHistoryDTO[] = [];
      if (changedReferences.length) {
        const details = await this.provider.fetchSalesOrderHistoryByReferences({
          partnerCompanyReference: externalReference(counterpartyRef, "counterparty"),
          orderReferences: changedReferences.map((result) => result.reference),
          historySyncContext: { syncId, page: 1 },
        });
        oneCCallCount += details.requestCount ?? changedReferences.length;
        warnings += details.enrichmentWarningCount + details.lineWarningCount;
        for (const fetched of details.items) {
          const current = currentByRef.get(fetched.reference.externalId.toLowerCase());
          if (!current) continue;
          changed.push({ ...fetched, currencyCode: fetched.currencyCode ?? current.currencyCode });
        }
      }
      if (changed.length) {
        const batch = await this.repository.upsertBatch({ companyId, syncId, syncedAt, orders: changed });
        updated += batch.updated + batch.inserted;
        hidden += batch.hidden;
      }
      const applied = await this.repository.applyExistenceResults({
        companyId,
        syncId,
        verifiedAt: syncedAt,
        results: verification.results.map((result) => ({
          external1cOrderRef: result.reference.externalId,
          status: result.status,
        })),
      });
      hidden += applied.hidden;
      warnings += verification.results.filter((result) => result.status === "unknown").length;
    }
    const durationMs = this.now() - startedAt;
    console.info({
      event: warnings ? "sync_completed_with_warnings" : "sync_completed",
      domain: "active_order_status",
      received: candidates.length,
      updated,
      hidden,
      warnings,
      durationMs,
      databaseQueryCount: 1 + groups.size * 2,
      oneCCallCount,
      peakBatchSize: Math.min(candidates.length, ACTIVE_ORDER_BATCH_SIZE),
      concurrencyLimit: ACTIVE_ORDER_CONCURRENCY,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return { received: candidates.length, updated, hidden, unchanged, warnings, oneCCallCount, concurrencyLimit: ACTIVE_ORDER_CONCURRENCY, durationMs };
  }

  async refreshCompanyHistories(): Promise<{ companies: number; completed: number; skipped: number; failed: number }> {
    if (!this.repository.listSyncCompanies) throw new Error("Order-history automation repository is unavailable.");
    const companies = await this.repository.listSyncCompanies(100);
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    for (const company of companies) {
      try {
        await this.historyService.syncCompany(company.companyId, company.counterpartyRef, "incremental");
        completed += 1;
      } catch (error) {
        if (error instanceof Error && error.message.includes("already running")) skipped += 1;
        else {
          failed += 1;
          console.error({ event: "sync_failed", domain: "order_history", companyId: company.companyId, errorType: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
        }
      }
    }
    return { companies: companies.length, completed, skipped, failed };
  }
}

function groupCandidates(candidates: import("../repositories").ActiveOrderRefreshCandidate[]) {
  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = `${candidate.order.companyId}|${candidate.counterpartyRef}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return groups;
}

function externalReference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function emptyActiveResult(durationMs: number): ActiveOrderRefreshResult {
  return { received: 0, updated: 0, hidden: 0, unchanged: 0, warnings: 0, oneCCallCount: 0, concurrencyLimit: ACTIVE_ORDER_CONCURRENCY, durationMs };
}
