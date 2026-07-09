import type { CatalogUpdaterService } from "../../catalog/services";
import type { ERPProvider } from "../contracts";
import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
} from "../dto";

export type CatalogSyncReportStatus = "succeeded" | "failed" | "partial";

export type CatalogSyncReport = {
  provider: string;
  target: "catalog";
  status: CatalogSyncReportStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  categoriesReceived: number;
  categoriesCreated: number;
  categoriesUpdated: number;
  brandsReceived: number;
  brandsCreated: number;
  brandsUpdated: number;
  productsReceived: number;
  productsCreated: number;
  productsUpdated: number;
  failed: number;
  errors: string[];
};

export class DefaultCatalogSyncEngine {
  constructor(
    private readonly provider: ERPProvider,
    private readonly catalogUpdater: CatalogUpdaterService,
  ) {}

  async syncCatalog(): Promise<CatalogSyncReport> {
    const startedAtDate = new Date();
    const report = createInitialReport(this.provider.providerCode, startedAtDate);
    const categories: CatalogCategoryDTO[] = [];
    const brands: CatalogBrandDTO[] = [];
    const products: CatalogProductDTO[] = [];

    try {
      if (!this.provider.catalog) {
        throw new Error("Catalog provider is not available.");
      }

      categories.push(
        ...(await fetchAllPages((input) =>
          this.provider.catalog!.fetchCategories(input),
        )),
      );
      report.categoriesReceived = categories.length;

      const categoryResult = await this.catalogUpdater.updateCatalogReadModel({
        categories,
        brands: [],
        products: [],
      });
      report.categoriesCreated = categoryResult.created;
      report.categoriesUpdated = categoryResult.updated;
      appendWarnings(report, categoryResult.warnings);
      report.failed += categoryResult.failed;

      brands.push(
        ...(await fetchAllPages((input) =>
          this.provider.catalog!.fetchBrands(input),
        )),
      );
      report.brandsReceived = brands.length;

      const brandResult = await this.catalogUpdater.updateCatalogReadModel({
        categories: [],
        brands,
        products: [],
      });
      report.brandsCreated = brandResult.created;
      report.brandsUpdated = brandResult.updated;
      appendWarnings(report, brandResult.warnings);
      report.failed += brandResult.failed;

      products.push(
        ...(await fetchAllPages((input) =>
          this.provider.catalog!.fetchProducts(input),
        )),
      );
      report.productsReceived = products.length;

      const productResult = await this.catalogUpdater.updateCatalogReadModel({
        categories: [],
        brands: [],
        products,
      });
      report.productsCreated = productResult.created;
      report.productsUpdated = productResult.updated;
      appendWarnings(report, productResult.warnings);
      report.failed += productResult.failed;
    } catch {
      report.failed += 1;
      report.errors.push("Catalog synchronization failed.");
    }

    finalizeReport(report, startedAtDate);
    return report;
  }
}

function createInitialReport(
  provider: string,
  startedAtDate: Date,
): CatalogSyncReport {
  return {
    provider,
    target: "catalog",
    status: "succeeded",
    startedAt: startedAtDate.toISOString(),
    finishedAt: startedAtDate.toISOString(),
    durationMs: 0,
    categoriesReceived: 0,
    categoriesCreated: 0,
    categoriesUpdated: 0,
    brandsReceived: 0,
    brandsCreated: 0,
    brandsUpdated: 0,
    productsReceived: 0,
    productsCreated: 0,
    productsUpdated: 0,
    failed: 0,
    errors: [],
  };
}

function appendWarnings(report: CatalogSyncReport, warnings: string[]): void {
  report.errors.push(...warnings);
}

function finalizeReport(report: CatalogSyncReport, startedAtDate: Date): void {
  const finishedAtDate = new Date();
  report.finishedAt = finishedAtDate.toISOString();
  report.durationMs = finishedAtDate.getTime() - startedAtDate.getTime();

  if (report.failed > 0 && hasImportedRows(report)) {
    report.status = "partial";
    return;
  }

  report.status = report.failed > 0 ? "failed" : "succeeded";
}

function hasImportedRows(report: CatalogSyncReport): boolean {
  return (
    report.categoriesCreated +
      report.categoriesUpdated +
      report.brandsCreated +
      report.brandsUpdated +
      report.productsCreated +
      report.productsUpdated >
    0
  );
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
    throw new Error("Catalog synchronization page limit reached.");
  }

  return items;
}
