import type { PartnerCompanyRepository } from "../../access-control/repositories";
import type { CatalogRepository } from "../../catalog/repositories";
import type { ProductPriceDTO, ReadModelUpdateResult } from "../../integration";
import type { PricingInventoryRepository } from "../repositories";

export type PricingReadModelUpdateInput = {
  prices: ProductPriceDTO[];
};

export interface PricingUpdaterService {
  updatePricingReadModel(
    input: PricingReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult>;
}

export class DefaultPricingUpdaterService implements PricingUpdaterService {
  constructor(
    private readonly pricingInventoryRepository: PricingInventoryRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly partnerCompanyRepository: PartnerCompanyRepository,
  ) {}

  async updatePricingReadModel(
    input: PricingReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult> {
    const result = createEmptyResult();
    const syncId = crypto.randomUUID();
    const priceTypes = new Map(input.prices.flatMap((price) => price.priceTypeReference ? [[price.priceTypeReference.externalId, price] as const] : []));
    for (const [externalRef, price] of priceTypes) await this.pricingInventoryRepository.upsertPriceType?.({ externalRef, externalCode: price.priceTypeCode ?? "", name: price.priceTypeName ?? price.priceTypeCode ?? externalRef, currencyCode: price.currencyStatus === "resolved" ? price.money.currency : null, currencyStatus: price.currencyStatus ?? "unresolved", sourceUpdatedAt: price.metadata.sourceUpdatedAt });

    for (const price of input.prices) {
      try {
        const product =
          (await this.catalogRepository.findProductByExternal1cId(
            price.productReference.externalId,
          )) ??
          (await this.catalogRepository.findProductBySku(
            price.productReference.externalId,
          ));

        if (!product) {
          result.skipped += 1;
          result.warnings.push(
            `Price ${price.reference.externalId} skipped: product ${price.productReference.externalId} was not found.`,
          );
          continue;
        }

        const company = price.partnerCompanyReference
          ? await this.partnerCompanyRepository.findByExternal1cId(
              price.partnerCompanyReference.externalId,
            )
          : null;

        if (price.partnerCompanyReference && !company) {
          result.skipped += 1;
          result.warnings.push(
            `Price ${price.reference.externalId} skipped: partner company ${price.partnerCompanyReference.externalId} was not found.`,
          );
          continue;
        }

        const upserted =
          await this.pricingInventoryRepository.upsertProductPrice({
            productId: product.id,
            companyId: company?.id ?? null,
            external1cPriceTypeId:
              price.priceTypeReference?.externalId ?? null,
            currency: price.money.currency,
            priceAmount: price.money.amount,
            validFrom: price.validFrom,
            validTo: price.validTo,
            isActive: price.isActive,
            currencyStatus: price.currencyStatus,
            externalProductRef: price.productReference.externalId,
            sourceVersion: price.metadata.sourceVersion ?? null,
            syncId,
          });

        if (upserted.created) {
          result.created += 1;
        } else {
          result.updated += 1;
        }
      } catch {
        result.failed += 1;
        result.warnings.push(
          `Price ${price.reference.externalId} was not imported.`,
        );
      }
    }

    if (result.failed === 0) await this.pricingInventoryRepository.deactivateMissingProductPrices?.(syncId);

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
