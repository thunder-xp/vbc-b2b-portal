import type { OrderProvider } from "../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../integration/dto";
import type { PartnerOrderHistoryRepository } from "../repositories";
import type { PartnerOrderHistory } from "../types";
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
    if (!this.repository.listActiveRefreshCandidates || !this.repository.touchSynchronizedOrders) throw new Error("Active-order automation repository is unavailable.");
    const candidates = await this.repository.listActiveRefreshCandidates({
      olderThan: new Date(startedAt - ACTIVE_ORDER_MIN_AGE_MS).toISOString(),
      limit: ACTIVE_ORDER_BATCH_SIZE,
    });
    if (!candidates.length) return emptyActiveResult(this.now() - startedAt);
    if (!this.provider.fetchSalesOrderHistoryByReferences) throw new Error("Exact active-order refresh is unavailable.");

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
      const result = await this.provider.fetchSalesOrderHistoryByReferences({
        partnerCompanyReference: externalReference(counterpartyRef, "counterparty"),
        orderReferences: companyCandidates.map(({ order }) => externalReference(order.external1cOrderRef, "customer-order")),
        historySyncContext: { syncId, page: 1 },
      });
      oneCCallCount += result.rawRowCount + result.enrichmentWarningCount;
      warnings += result.enrichmentWarningCount;
      const currentByRef = new Map(companyCandidates.map(({ order }) => [order.external1cOrderRef.toLowerCase(), order]));
      const changed: SalesOrderHistoryDTO[] = [];
      for (const fetched of result.items) {
        const current = currentByRef.get(fetched.reference.externalId.toLowerCase());
        if (!current) continue;
        const normalized = { ...fetched, currencyCode: fetched.currencyCode ?? current.currencyCode };
        if (sameCurrentHeader(current, normalized)) unchanged += 1;
        else changed.push(normalized);
      }
      if (changed.length) {
        const batch = await this.repository.upsertBatch({ companyId, syncId, syncedAt, orders: changed });
        updated += batch.updated + batch.inserted;
        hidden += batch.hidden;
      }
      await this.repository.touchSynchronizedOrders({
        companyId,
        orderRefs: result.items.map((item) => item.reference.externalId),
        syncedAt,
      });
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
        await this.historyService.syncCompany(company.companyId, company.counterpartyRef, "full");
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

function sameCurrentHeader(current: PartnerOrderHistory, fetched: SalesOrderHistoryDTO): boolean {
  return current.external1cOrderNumber === fetched.number
    && current.oneCPosted === fetched.posted
    && current.oneCDeletionMark === fetched.deletionMark
    && current.oneCStateRef === (fetched.stateReference?.externalId ?? null)
    && current.oneCStateRaw === fetched.stateRaw
    && current.oneCStateCode === (fetched.stateCode === "unknown" ? null : fetched.stateCode)
    && current.oneCDocumentDate === fetched.documentDate
    && current.oneCDeliveryDate === fetched.requestedDeliveryDate
    && current.oneCSourceVersion === fetched.sourceVersion
    && current.documentTotal === fetched.documentTotal
    && current.currencyCode === fetched.currencyCode;
}

function externalReference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function emptyActiveResult(durationMs: number): ActiveOrderRefreshResult {
  return { received: 0, updated: 0, hidden: 0, unchanged: 0, warnings: 0, oneCCallCount: 0, concurrencyLimit: ACTIVE_ORDER_CONCURRENCY, durationMs };
}
