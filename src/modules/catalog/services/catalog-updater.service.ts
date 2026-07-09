import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
} from "../../integration/dto";
import type { ReadModelUpdateResult } from "../../integration/sync";
import type { CatalogRepository } from "../repositories";

export type CatalogReadModelUpdateInput = {
  categories: CatalogCategoryDTO[];
  brands: CatalogBrandDTO[];
  products: CatalogProductDTO[];
};

export interface CatalogUpdaterService {
  updateCatalogReadModel(
    input: CatalogReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult>;
}

export class DefaultCatalogUpdaterService implements CatalogUpdaterService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async updateCatalogReadModel(
    input: CatalogReadModelUpdateInput,
  ): Promise<ReadModelUpdateResult> {
    const result = createEmptyResult();
    const categoryIdByExternalId = new Map<string, string>();
    const brandIdByExternalId = new Map<string, string>();

    for (const category of input.categories) {
      try {
        const parentId = category.parentReference
          ? categoryIdByExternalId.get(category.parentReference.externalId) ??
            (await this.catalogRepository.findCategoryByExternal1cId(
              category.parentReference.externalId,
            ))?.id ??
            null
          : null;
        const upserted = await this.catalogRepository.upsertCategory({
          external1cId: category.reference.externalId,
          parentId,
          name: category.name,
          slug: normalizeSlug(category.slug, category.name),
          description: category.description,
          isActive: category.isActive,
        });

        categoryIdByExternalId.set(
          category.reference.externalId,
          upserted.record.id,
        );
        incrementResult(result, upserted.created);
      } catch {
        result.failed += 1;
        result.warnings.push(
          `Category ${category.reference.externalId} was not imported.`,
        );
      }
    }

    for (const brand of input.brands) {
      try {
        const upserted = await this.catalogRepository.upsertBrand({
          external1cId: brand.reference.externalId,
          name: brand.name,
          slug: normalizeSlug(brand.slug, brand.name),
          description: brand.description,
          logoUrl: brand.logoUrl,
          isActive: brand.isActive,
        });

        brandIdByExternalId.set(brand.reference.externalId, upserted.record.id);
        incrementResult(result, upserted.created);
      } catch {
        result.failed += 1;
        result.warnings.push(
          `Brand ${brand.reference.externalId} was not imported.`,
        );
      }
    }

    for (const product of input.products) {
      try {
        const categoryId = product.categoryReference
          ? categoryIdByExternalId.get(product.categoryReference.externalId) ??
            (await this.catalogRepository.findCategoryByExternal1cId(
              product.categoryReference.externalId,
            ))?.id ??
            null
          : null;
        const brandId = product.brandReference
          ? brandIdByExternalId.get(product.brandReference.externalId) ??
            (await this.catalogRepository.findBrandByExternal1cId(
              product.brandReference.externalId,
            ))?.id ??
            null
          : null;
        const upserted = await this.catalogRepository.upsertProduct({
          external1cId: product.reference.externalId,
          categoryId,
          brandId,
          sku: product.sku,
          name: product.name,
          slug: normalizeSlug(product.slug, product.name || product.sku),
          shortDescription: product.shortDescription,
          description: product.description,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          isVisible: product.isVisible,
        });

        incrementResult(result, upserted.created);
      } catch {
        result.failed += 1;
        result.warnings.push(
          `Product ${product.reference.externalId} was not imported.`,
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

function incrementResult(result: ReadModelUpdateResult, created: boolean): void {
  if (created) {
    result.created += 1;
  } else {
    result.updated += 1;
  }
}

function normalizeSlug(slug: string | null, fallback: string): string {
  const source = slug?.trim() || fallback;
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "catalog-item";
}
