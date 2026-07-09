import type { InventoryUpdaterService } from "../../pricing-inventory/services";
import type { ERPProvider } from "../contracts";
import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  StockBalanceDTO,
} from "../dto";

export type StockSyncReportStatus = "succeeded" | "failed" | "partial";

export type StockSyncReport = {
  provider: string;
  target: "inventory";
  status: StockSyncReportStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stockReceived: number;
  stockCreated: number;
  stockUpdated: number;
  stockSkipped: number;
  failed: number;
  errors: string[];
  warnings: string[];
};

export class DefaultStockSyncEngine {
  constructor(
    private readonly provider: ERPProvider,
    private readonly inventoryUpdater: InventoryUpdaterService,
  ) {}

  async syncStock(): Promise<StockSyncReport> {
    const startedAtDate = new Date();
    const report = createInitialReport(this.provider.providerCode, startedAtDate);

    try {
      if (!this.provider.inventory) {
        throw new Error("Inventory provider is not available.");
      }

      const stockBalances = await fetchAllPages((input) =>
        this.provider.inventory!.fetchStockBalances(input),
      );
      report.stockReceived = stockBalances.length;

      const updateResult =
        await this.inventoryUpdater.updateInventoryReadModel({
          stockBalances,
        });
      report.stockCreated = updateResult.created;
      report.stockUpdated = updateResult.updated;
      report.stockSkipped = updateResult.skipped;
      report.failed += updateResult.failed;
      report.warnings.push(...updateResult.warnings);
    } catch {
      report.failed += 1;
      report.errors.push("Stock synchronization failed.");
    }

    finalizeReport(report, startedAtDate);
    return report;
  }
}

const MAX_SYNC_PAGES = 100;

async function fetchAllPages<TItem>(
  fetchPage: (
    input: IntegrationSyncWindowDTO,
  ) => Promise<IntegrationPageResultDTO<TItem>>,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const page = await fetchPage({
      page: cursor ? { cursor } : undefined,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    pageCount += 1;
  } while (cursor && pageCount < MAX_SYNC_PAGES);

  if (cursor) {
    throw new Error("Stock synchronization page limit reached.");
  }

  return items;
}

function createInitialReport(
  provider: string,
  startedAtDate: Date,
): StockSyncReport {
  return {
    provider,
    target: "inventory",
    status: "succeeded",
    startedAt: startedAtDate.toISOString(),
    finishedAt: startedAtDate.toISOString(),
    durationMs: 0,
    stockReceived: 0,
    stockCreated: 0,
    stockUpdated: 0,
    stockSkipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
  };
}

function finalizeReport(report: StockSyncReport, startedAtDate: Date): void {
  const finishedAtDate = new Date();
  report.finishedAt = finishedAtDate.toISOString();
  report.durationMs = finishedAtDate.getTime() - startedAtDate.getTime();

  if (report.failed > 0 && report.stockCreated + report.stockUpdated > 0) {
    report.status = "partial";
    return;
  }

  report.status = report.failed > 0 ? "failed" : "succeeded";
}
