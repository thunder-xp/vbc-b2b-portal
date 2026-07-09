import type { CatalogRepository } from "../../catalog/repositories";
import type { ReadModelUpdateResult, StockBalanceDTO } from "../../integration";
import type { PricingInventoryRepository } from "../repositories";

export type InventoryReadModelUpdateInput = {
  stockBalances: StockBalanceDTO[];
};

export interface InventoryUpdaterService {
  updateInventoryReadModel(
    input: InventoryReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult>;
}

export class DefaultInventoryUpdaterService implements InventoryUpdaterService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly catalogRepository: CatalogRepository,
  ) {}

  async updateInventoryReadModel(
    input: InventoryReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult> {
    const result = createEmptyResult();

    for (const stockBalance of input.stockBalances) {
      try {
        const product =
          (await this.catalogRepository.findProductByExternal1cId(
            stockBalance.productReference.externalId,
          )) ??
          (await this.catalogRepository.findProductBySku(
            stockBalance.productReference.externalId,
          ));

        if (!product) {
          result.skipped += 1;
          result.warnings.push(
            `Stock ${stockBalance.reference.externalId} skipped: product ${stockBalance.productReference.externalId} was not found.`,
          );
          continue;
        }

        const upserted =
          await this.pricingInventoryRepository.upsertProductStockBalance({
            productId: product.id,
            warehouseName: stockBalance.warehouseName,
            availableQuantity: stockBalance.availableQuantity,
            reservedQuantity: stockBalance.reservedQuantity,
            expectedQuantity: stockBalance.expectedQuantity,
            expectedAt: stockBalance.expectedAt,
            updatedFrom1cAt: stockBalance.sourceUpdatedAt,
            isActive: stockBalance.isActive,
          });

        if (upserted.created) {
          result.created += 1;
        } else {
          result.updated += 1;
        }
      } catch {
        result.failed += 1;
        result.warnings.push(
          `Stock ${stockBalance.reference.externalId} was not imported.`,
        );
      }
    }

    return result;
  }
}

function createEmptyResult(): ReadModelUpdateResult {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    warnings: [],
  };
}
