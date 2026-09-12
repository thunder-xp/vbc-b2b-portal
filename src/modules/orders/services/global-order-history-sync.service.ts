import type { OrderProvider } from "../../integration/contracts";
import type { GlobalOrderHistoryCounterpartyDTO } from "../../integration/dto";
import type { GlobalOrderHistoryRepository } from "../repositories";

const PAGE_SIZE = 1000;
const MAX_COUNTERPARTY_PAGES = 20;
const DEFAULT_MAX_DATA_PAGES = 120;

export type GlobalOrderHistorySyncResult = {
  status: "completed" | "continued" | "locked" | "already_completed";
  phase: "headers" | "items" | "completed";
  counterpartyPages: number;
  dataPages: number;
  oneCRequests: number;
  oneCDurationMs: number;
  sourceHeaderRows: number;
  sourceItemRows: number;
  excludedItemRows: number;
  durationMs: number;
};

export class GlobalOrderHistorySyncService {
  constructor(
    private readonly repository: GlobalOrderHistoryRepository,
    private readonly provider: OrderProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async synchronize(input: { restart?: boolean; maxDataPages?: number } = {}): Promise<GlobalOrderHistorySyncResult> {
    const startedAt = this.now();
    const checkpoint = await this.repository.acquire(input.restart === true);
    if (checkpoint.status === "locked" || checkpoint.status === "completed") {
      return {
        status: checkpoint.status === "locked" ? "locked" : "already_completed",
        phase: checkpoint.status === "completed" ? "completed" : "headers",
        counterpartyPages: 0, dataPages: 0, oneCRequests: 0,
        oneCDurationMs: 0, sourceHeaderRows: 0, sourceItemRows: 0,
        excludedItemRows: 0, durationMs: this.now() - startedAt,
      };
    }
    const lockToken = checkpoint.lockToken;
    if (!lockToken || !checkpoint.phase || checkpoint.phase === "completed") {
      throw new Error("Global order-history checkpoint is invalid.");
    }

    let oneCRequests = 0;
    let oneCDurationMs = 0;
    let counterpartyPages = 0;
    let dataPages = 0;
    let sourceHeaderRows = 0;
    let sourceItemRows = 0;
    let excludedItemRows = 0;
    let phase: "headers" | "items" = checkpoint.phase;
    let cursor = phase === "headers" ? checkpoint.headerCursor : checkpoint.itemCursor;
    const maxDataPages = Math.max(1, Math.min(input.maxDataPages ?? DEFAULT_MAX_DATA_PAGES, 200));

    try {
      const counterparties = await this.loadCounterparties();
      counterpartyPages = counterparties.pages;
      oneCRequests += counterparties.pages;
      oneCDurationMs += counterparties.durationMs;

      while (dataPages < maxDataPages) {
        if (phase === "headers") {
          if (!this.provider.fetchGlobalSalesOrderHistoryHeaders) {
            throw new Error("Global 1C order-header feed is unavailable.");
          }
          const page = await this.provider.fetchGlobalSalesOrderHistoryHeaders({ page: { limit: PAGE_SIZE, cursor } });
          assertCompletePage(page.rejectedRowCount, "header");
          oneCRequests += page.requestCount;
          oneCDurationMs += page.requestDurationMs;
          sourceHeaderRows += page.rawRowCount;
          const headers = page.items.map((header) => {
            const classification = counterparties.byRef.get(header.partnerCompanyReference.externalId.toLowerCase());
            return {
              ...header,
              sourceCounterpartyTypeCode: classification?.counterpartyTypeCode ?? null,
              sourceGovernmentBodyTypeCode: classification?.governmentBodyTypeCode ?? null,
            };
          });
          const hasMore = page.nextCursor !== null;
          await this.repository.persistHeaderPage({
            lockToken, cursor, nextCursor: page.nextCursor ?? cursor,
            hasMore, headers, counterpartyMetrics: counterparties.metrics,
          });
          dataPages += 1;
          if (hasMore) {
            cursor = page.nextCursor!;
          } else {
            phase = "items";
            cursor = "0";
          }
          continue;
        }

        if (!this.provider.fetchGlobalSalesOrderHistoryItems) {
          throw new Error("Global 1C order-item feed is unavailable.");
        }
        const page = await this.provider.fetchGlobalSalesOrderHistoryItems({ page: { limit: PAGE_SIZE, cursor } });
        assertCompletePage(page.rejectedRowCount, "item");
        oneCRequests += page.requestCount;
        oneCDurationMs += page.requestDurationMs;
        sourceItemRows += page.rawRowCount;
        excludedItemRows += page.excludedRowCount ?? 0;
        const hasMore = page.nextCursor !== null;
        const persisted = await this.repository.persistItemPage({
          lockToken, cursor, nextCursor: page.nextCursor ?? cursor,
          hasMore, items: page.items,
        });
        dataPages += 1;
        if (persisted.completed) {
          const result = resultOf("completed", "completed");
          console.info({ event: "global_order_history_sync_completed", ...result });
          return result;
        }
        cursor = page.nextCursor!;
      }

      await this.repository.release(lockToken);
      const result = resultOf("continued", phase);
      console.info({ event: "global_order_history_sync_checkpointed", cursor, ...result });
      return result;
    } catch (error) {
      await this.repository.fail(lockToken, safeError(error));
      console.error({
        event: "global_order_history_sync_failed",
        phase, cursor, dataPages,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }

    function resultOf(
      status: GlobalOrderHistorySyncResult["status"],
      finalPhase: GlobalOrderHistorySyncResult["phase"],
    ): GlobalOrderHistorySyncResult {
      return {
        status, phase: finalPhase, counterpartyPages, dataPages,
        oneCRequests, oneCDurationMs: Math.round(oneCDurationMs),
        sourceHeaderRows, sourceItemRows, excludedItemRows,
        durationMs: Math.max(0, Math.round(Date.now() - startedAt)),
      };
    }
  }

  private async loadCounterparties(): Promise<{
    byRef: Map<string, GlobalOrderHistoryCounterpartyDTO>;
    pages: number;
    durationMs: number;
    metrics: Record<string, unknown>;
  }> {
    if (!this.provider.fetchGlobalOrderHistoryCounterparties) {
      throw new Error("Global 1C counterparty feed is unavailable.");
    }
    const byRef = new Map<string, GlobalOrderHistoryCounterpartyDTO>();
    const typeDistribution = new Map<string, number>();
    const governmentDistribution = new Map<string, number>();
    let pages = 0;
    let durationMs = 0;
    let cursor: string | null = "0";
    do {
      if (pages >= MAX_COUNTERPARTY_PAGES) throw new Error("Global 1C counterparty feed exceeded its page bound.");
      const page = await this.provider.fetchGlobalOrderHistoryCounterparties({ page: { limit: PAGE_SIZE, cursor } });
      assertCompletePage(page.rejectedRowCount, "counterparty");
      pages += 1;
      durationMs += page.requestDurationMs;
      for (const counterparty of page.items) {
        const ref = counterparty.reference.externalId.toLowerCase();
        if (byRef.has(ref)) throw new Error("Global 1C counterparty feed returned a duplicate identity.");
        byRef.set(ref, counterparty);
        increment(typeDistribution, counterparty.counterpartyTypeCode ?? "<empty>");
        increment(governmentDistribution, counterparty.governmentBodyTypeCode ?? "<empty>");
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return {
      byRef, pages, durationMs,
      metrics: {
        pages, scanned: byRef.size,
        typeDistribution: Object.fromEntries(typeDistribution),
        governmentBodyTypeDistribution: Object.fromEntries(governmentDistribution),
        eligibleTypes: ["ЮридическоеЛицо", "ИндивидуальныйПредприниматель"],
      },
    };
  }
}

function assertCompletePage(rejected: number, kind: string): void {
  if (rejected > 0) throw new Error(`Global 1C ${kind} page contained rejected rows.`);
}

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : "global_history_sync_failed";
}
