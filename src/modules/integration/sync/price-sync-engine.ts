import type { PricingUpdaterService } from "../../pricing-inventory/services";
import type { ERPProvider } from "../contracts";
import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  ProductPriceDTO,
} from "../dto";

export type PriceSyncReportStatus = "succeeded" | "failed" | "partial";

export type PriceSyncReport = {
  provider: string;
  target: "pricing";
  status: PriceSyncReportStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pricesReceived: number;
  pricesCreated: number;
  pricesUpdated: number;
  pricesSkipped: number;
  failed: number;
  errors: string[];
  warnings: string[];
};

export class DefaultPriceSyncEngine {
  constructor(
    private readonly provider: ERPProvider,
    private readonly pricingUpdater: PricingUpdaterService,
  ) {}

  async syncPrices(): Promise<PriceSyncReport> {
    const startedAtDate = new Date();
    const report = createInitialReport(this.provider.providerCode, startedAtDate);

    try {
      if (!this.provider.pricing) {
        throw new Error("Pricing provider is not available.");
      }

      const prices = await fetchAllPages((input) =>
        this.provider.pricing!.fetchProductPrices(input),
      );
      report.pricesReceived = prices.length;

      const updateResult = await this.pricingUpdater.updatePricingReadModel({
        prices,
      });
      report.pricesCreated = updateResult.created;
      report.pricesUpdated = updateResult.updated;
      report.pricesSkipped = updateResult.skipped;
      report.failed += updateResult.failed;
      report.warnings.push(...updateResult.warnings);
    } catch {
      report.failed += 1;
      report.errors.push("Price synchronization failed.");
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
    throw new Error("Price synchronization page limit reached.");
  }

  return items;
}

function createInitialReport(
  provider: string,
  startedAtDate: Date,
): PriceSyncReport {
  return {
    provider,
    target: "pricing",
    status: "succeeded",
    startedAt: startedAtDate.toISOString(),
    finishedAt: startedAtDate.toISOString(),
    durationMs: 0,
    pricesReceived: 0,
    pricesCreated: 0,
    pricesUpdated: 0,
    pricesSkipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
  };
}

function finalizeReport(report: PriceSyncReport, startedAtDate: Date): void {
  const finishedAtDate = new Date();
  report.finishedAt = finishedAtDate.toISOString();
  report.durationMs = finishedAtDate.getTime() - startedAtDate.getTime();

  if (report.failed > 0 && hasImportedRows(report)) {
    report.status = "partial";
    return;
  }

  report.status = report.failed > 0 ? "failed" : "succeeded";
}

function hasImportedRows(report: PriceSyncReport): boolean {
  return report.pricesCreated + report.pricesUpdated > 0;
}
