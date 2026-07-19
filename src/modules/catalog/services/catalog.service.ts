import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type {
  PricingInventoryService,
  ProductCommercialViewDto,
  ProductCommercialInternalDto,
} from "../../pricing-inventory/services";
import type { CatalogRepository, ListCatalogProductsInput } from "../repositories";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
} from "../types";
import {
  parseCatalogSort,
  requiresCommercialCatalogSort,
  sortCatalogProducts,
  type CatalogSort,
} from "./catalog-sorting";

export type CatalogCategoryDto = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
};

export type CatalogBrandDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

export type CatalogProductListInput = {
  categoryId?: string;
  brandId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: CatalogSort;
  attributeFilters?: Record<string, string[]>;
  availability?: "all" | "in_stock" | "expected";
  availabilityProductIds?: string[];
};

export type CatalogFacetDto = { key: string; label: string; values: Array<{ value: string; count: number; selected: boolean }> };

export type CatalogProductCardDto = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  brand: CatalogBrandDto | null;
  category: CatalogCategoryDto | null;
  keyCharacteristics: CatalogProductCharacteristicDto[];
  datasheet: CatalogProductDocumentDto | null;
};

export type CatalogProductCharacteristicDto = {
  key?: string;
  label: string;
  value: string;
  filterValue?: string;
  isFilterable?: boolean;
  valueType?: string | null;
};

export type CatalogProductListResult = {
  products: CatalogProductCardDto[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  isDemoData: boolean;
  totalCount: number;
  facets: CatalogFacetDto[];
  commercialViews?: ProductCommercialViewDto[];
};

export type CatalogProductImageDto = {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
};

export type CatalogProductDocumentDto = {
  id: string;
  title: string;
  documentType: string;
  url: string;
};

export type CatalogProductDetailDto = CatalogProductCardDto & {
  description: string | null;
  images: CatalogProductImageDto[];
  documents: CatalogProductDocumentDto[];
};

export type CatalogProductOrderIdentityDto = {
  id: string;
  external1cId: string;
  sku: string;
  name: string;
};

export type CatalogProductRouteIdentityDto = { id: string; slug: string };

export interface CatalogService {
  listCategories(userId: string): Promise<CatalogCategoryDto[]>;
  listBrands(userId: string): Promise<CatalogBrandDto[]>;
  listProducts(
    userId: string,
    input: CatalogProductListInput,
  ): Promise<CatalogProductListResult>;
  getProductDetailBySlug(
    userId: string,
    slug: string,
  ): Promise<CatalogProductDetailDto | null>;
  getProductRouteIdentityBySlug?(userId: string, slug: string): Promise<CatalogProductRouteIdentityDto | null>;
  getProductDetailById?(userId: string, id: string): Promise<CatalogProductDetailDto | null>;
  getProductsByIds(
    userId: string,
    productIds: string[],
  ): Promise<CatalogProductCardDto[]>;
  getProductOrderIdentities(
    userId: string,
    productIds: string[],
  ): Promise<CatalogProductOrderIdentityDto[]>;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

async function measurePerformanceStage<T>(
  routeCategory: string,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (process.env.PERFORMANCE_DIAGNOSTICS_ENABLED !== "true") return operation();
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.info(JSON.stringify({
      event: "catalog_performance_stage",
      routeCategory,
      stage,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    }));
  }
}

export class DefaultCatalogService implements CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly pricingInventoryService?: PricingInventoryService,
  ) {}

  async listCategories(userId: string): Promise<CatalogCategoryDto[]> {
    await this.ensureCatalogAccess(userId);
    const categories = await this.catalogRepository.listCategories();

    if (categories.length === 0 && (await this.isCatalogEmpty())) {
      return demoCategories.map(toCategoryDto);
    }

    return categories.map(toCategoryDto);
  }

  async listBrands(userId: string): Promise<CatalogBrandDto[]> {
    await this.ensureCatalogAccess(userId);
    const brands = await this.catalogRepository.listBrands();

    if (brands.length === 0 && (await this.isCatalogEmpty())) {
      return demoBrands.map(toBrandDto);
    }

    return brands.map(toBrandDto);
  }

  async listProducts(
    userId: string,
    input: CatalogProductListInput,
  ): Promise<CatalogProductListResult> {
    const companyId = await measurePerformanceStage("catalog", "access", () => this.ensureCatalogAccess(userId));
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const sort = parseCatalogSort(input.sort);
    const attributeFilters = normalizeAttributeFilters(input.attributeFilters);

    if (this.catalogRepository.listPartnerPage) {
      return this.listPartnerCatalogPage(userId, companyId, {
        ...input,
        page,
        pageSize,
        sort,
        attributeFilters,
      });
    }

    const [brands, categories] = await measurePerformanceStage(
      "catalog",
      "metadata",
      () => Promise.all([
        this.catalogRepository.listBrands(),
        this.catalogRepository.listCategories(),
      ]),
    );
    const categoryIds = input.categoryId
      ? collectCategoryAndDescendantIds(input.categoryId, categories)
      : undefined;
    const [attributeProductIds, facetRows] = await measurePerformanceStage(
      "catalog",
      "facets",
      () => Promise.all([
        Object.keys(attributeFilters).length ? this.catalogRepository.findMatchingProductIds?.(categoryIds, attributeFilters) ?? Promise.resolve([]) : Promise.resolve(undefined),
        this.catalogRepository.listAttributeFacets?.(categoryIds, attributeFilters) ?? Promise.resolve([]),
      ]),
    );
    const matchingProductIds = intersectProductIds(
      attributeProductIds,
      input.availabilityProductIds,
    );
    const normalizedSearch = input.search?.trim().toLowerCase();
    const searchBrandIds = normalizedSearch
      ? brands.filter((brand) => brand.name.toLowerCase().includes(normalizedSearch)).map((brand) => brand.id)
      : undefined;
    const repositoryInput: ListCatalogProductsInput = {
      categoryIds,
      brandId: input.brandId,
      searchBrandIds,
      search: input.search,
      productIds: matchingProductIds,
    };
    const commercialSort = requiresCommercialCatalogSort(sort);
    let products: CatalogProduct[];
    let totalCount: number;
    let allCommercialViews: ProductCommercialViewDto[] | undefined;
    if (sort !== "default") {
      [products, totalCount, allCommercialViews] = await measurePerformanceStage(
        "catalog",
        "commercial_sort",
        () => this.loadAndSortCommercialProducts(userId, repositoryInput, sort),
      );
    } else {
      [products, totalCount] = await measurePerformanceStage(
        "catalog",
        "product_page_and_count",
        () => Promise.all([
          this.catalogRepository.listProducts({
            ...repositoryInput,
            limit: pageSize + 1,
            offset: (page - 1) * pageSize,
          }),
          this.catalogRepository.countProducts(repositoryInput),
        ]),
      );
    }
    const isEmptyCatalog = products.length === 0 && (await this.isCatalogEmpty());

    if (isEmptyCatalog) {
      const filteredDemoProducts = filterDemoProducts(input);
      const start = (page - 1) * pageSize;
      const demoCommercialViews = commercialSort
        ? await this.getCommercialViews(userId, filteredDemoProducts)
        : [];
      const sortedDemoProducts = sortCatalogProducts(
        filteredDemoProducts,
        demoCommercialViews,
        sort,
      );
      const pagedDemoProducts = sortedDemoProducts.slice(start, start + pageSize + 1);
      const demoBrandMap = createBrandMap(demoBrands);
      const demoCategoryMap = createCategoryMap(demoCategories);

      return {
        products: pagedDemoProducts
          .slice(0, pageSize)
          .map((product) =>
            this.toProductCardDto(product, demoBrandMap, demoCategoryMap),
          ),
        page,
        pageSize,
        hasNextPage: pagedDemoProducts.length > pageSize,
        isDemoData: true,
        totalCount: filteredDemoProducts.length,
        facets: [],
        commercialViews: commercialSort
          ? filterCommercialViews(demoCommercialViews, pagedDemoProducts.slice(0, pageSize))
          : undefined,
      };
    }
    const brandMap = createBrandMap(brands);
    const categoryMap = createCategoryMap(categories);
    const start = commercialSort ? (page - 1) * pageSize : 0;
    const visibleProducts = products.slice(start, start + pageSize);
    const [documents, attributes] = await measurePerformanceStage(
      "catalog",
      "card_detail_projection",
      () => Promise.all([
        this.catalogRepository.listProductDocumentsForProducts(
          visibleProducts.map((product) => product.id),
        ),
        this.catalogRepository.listProductAttributesForProducts?.(visibleProducts.map((product) => product.id)) ?? Promise.resolve([]),
      ]),
    );
    const datasheetByProduct = new Map(
      documents
        .filter((document) => document.documentType === "datasheet")
        .map((document) => [document.productId, document]),
    );

    return {
      products: visibleProducts.map((product) => this.toProductCardDto(
        product,
        brandMap,
        categoryMap,
        datasheetByProduct.get(product.id) ?? null,
        selectCardHighlights(attributes.filter((attribute) => attribute.productId === product.id)).map((attribute) => ({ label: attribute.label, value: attribute.displayValue })),
      )),
      page,
      pageSize,
      hasNextPage: commercialSort
        ? start + pageSize < totalCount
        : products.length > pageSize,
      isDemoData: false,
      totalCount,
      facets: buildFacets(facetRows, attributeFilters),
      commercialViews: commercialSort
        ? filterCommercialViews(allCommercialViews ?? [], visibleProducts)
        : undefined,
    };
  }

  private async listPartnerCatalogPage(
    userId: string,
    companyId: string,
    input: CatalogProductListInput & {
      page: number;
      pageSize: number;
      sort: CatalogSort;
      attributeFilters: Record<string, string[]>;
    },
  ): Promise<CatalogProductListResult> {
    const pagePromise = measurePerformanceStage(
      "catalog",
      "partner_page_aggregate",
      () => this.catalogRepository.listPartnerPage!({
        companyId,
        categoryId: input.categoryId,
        brandId: input.brandId,
        search: input.search,
        availability: input.availability ?? "all",
        attributeFilters: input.attributeFilters,
        sort: input.sort,
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      }),
    );
    const facetsPromise = measurePerformanceStage(
      "catalog",
      "facets",
      () => this.catalogRepository.listPartnerFacets?.({
        companyId,
        categoryId: input.categoryId,
        brandId: input.brandId,
        search: input.search,
        availability: input.availability ?? "all",
        attributeFilters: input.attributeFilters,
      }) ?? Promise.resolve([]),
    ).catch(() => []);
    const [partnerPage, facetRows] = await Promise.all([pagePromise, facetsPromise]);
    const commercialViews = await measurePerformanceStage(
      "catalog",
      "visible_page_commercial_enrichment",
      () => this.getCommercialViews(
        userId,
        partnerPage.items.map((item) => ({ id: item.id } as CatalogProduct)),
      ),
    );

    return {
      products: partnerPage.items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        slug: item.slug,
        shortDescription: null,
        imageUrl: item.imageUrl,
        brand: item.brand ? { ...item.brand, description: null, logoUrl: null } : null,
        category: item.category ? { ...item.category, description: null } : null,
        keyCharacteristics: [],
        datasheet: null,
      })),
      page: input.page,
      pageSize: input.pageSize,
      hasNextPage: input.page * input.pageSize < partnerPage.totalCount,
      isDemoData: false,
      totalCount: partnerPage.totalCount,
      facets: buildFacets(facetRows, input.attributeFilters),
      commercialViews,
    };
  }

  private async loadAndSortCommercialProducts(
    userId: string,
    repositoryInput: ListCatalogProductsInput,
    sort: Exclude<CatalogSort, "default">,
  ): Promise<[CatalogProduct[], number, ProductCommercialViewDto[]]> {
    if (!this.pricingInventoryService) {
      throw new Error("Catalog commercial sorting is unavailable.");
    }

    const totalCount = await this.catalogRepository.countProducts(repositoryInput);
    const products = await this.loadAllProducts(repositoryInput, totalCount);
    const commercialViews = await measurePerformanceStage(
      "catalog",
      "commercial_enrichment",
      () => this.getCommercialViews(userId, products),
    );

    return [
      sortCatalogProducts(products, commercialViews, sort),
      totalCount,
      commercialViews,
    ];
  }

  private async loadAllProducts(
    repositoryInput: ListCatalogProductsInput,
    totalCount: number,
  ): Promise<CatalogProduct[]> {
    const batchSize = 500;
    const products: CatalogProduct[] = [];

    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const batch = await this.catalogRepository.listProducts({
        ...repositoryInput,
        limit: Math.min(batchSize, totalCount - offset),
        offset,
      });
      products.push(...batch);
      if (batch.length < Math.min(batchSize, totalCount - offset)) break;
    }

    return products;
  }

  private async getCommercialViews(
    userId: string,
    products: CatalogProduct[],
  ): Promise<ProductCommercialViewDto[]> {
    if (!this.pricingInventoryService || products.length === 0) return [];
    const views = await this.pricingInventoryService.getProductCommercialViews(
      userId,
      products.map((product) => product.id),
    );
    return views.map(toPublicCommercialView);
  }

  async getProductDetailBySlug(
    userId: string,
    slug: string,
  ): Promise<CatalogProductDetailDto | null> {
    await this.ensureCatalogAccess(userId);
    const product = await this.catalogRepository.getProductBySlug(slug);

    if (product) {
      const [images, documents, attributes, brands, categories] = await Promise.all([
        this.catalogRepository.listProductImages(product.id),
        this.catalogRepository.listProductDocuments(product.id),
        this.catalogRepository.listProductAttributes?.(product.id) ?? Promise.resolve([]),
        this.catalogRepository.listBrands(),
        this.catalogRepository.listCategories(),
      ]);
      const projectedAttributes = attributes.map((attribute) => ({
        key: attribute.key,
        label: attribute.label,
        value: normalizeCharacteristicValue(attribute.displayValue, attribute.valueType),
        filterValue: attribute.displayValue.trim(),
        isFilterable: attribute.isFilterable && attribute.resolutionStatus !== "unresolved",
        valueType: attribute.valueType,
      }));
      const datasheet =
        documents.find((document) => document.documentType === "datasheet") ??
        createAttributeDatasheet(product.id, projectedAttributes);

      return this.toProductDetailDto(
        product,
        images,
        datasheet && !documents.some((document) => document.id === datasheet.id)
          ? [...documents, datasheet]
          : documents,
        createBrandMap(brands),
        createCategoryMap(categories),
        projectedAttributes.filter((attribute) => !isDatasheetAttribute(attribute.label)),
        datasheet,
      );
    }

    if (await this.isCatalogEmpty()) {
      const demoProduct = demoProducts.find((item) => item.slug === slug);

      if (!demoProduct) {
        return null;
      }

      return this.toProductDetailDto(
        demoProduct,
        demoImages.filter((image) => image.productId === demoProduct.id),
        demoDocuments.filter((document) => document.productId === demoProduct.id),
        createBrandMap(demoBrands),
        createCategoryMap(demoCategories),
      );
    }

    return null;
  }

  async getProductRouteIdentityBySlug(userId: string, slug: string): Promise<CatalogProductRouteIdentityDto | null> {
    await this.ensureCatalogAccess(userId);
    const product = await this.catalogRepository.getProductBySlug(slug);
    if (product) return { id: product.id, slug: product.slug };
    if (await this.isCatalogEmpty()) {
      const demoProduct = demoProducts.find((item) => item.slug === slug);
      return demoProduct ? { id: demoProduct.id, slug: demoProduct.slug } : null;
    }
    return null;
  }

  async getProductDetailById(userId: string, id: string): Promise<CatalogProductDetailDto | null> {
    await this.ensureCatalogAccess(userId);
    const aggregate = await this.catalogRepository.getProductDetailAggregateById?.(id);
    if (aggregate) {
      const projectedAttributes = aggregate.attributes.map((attribute) => ({
        key: attribute.key,
        label: attribute.label,
        value: normalizeCharacteristicValue(attribute.displayValue, attribute.valueType),
        filterValue: attribute.displayValue.trim(),
        isFilterable: attribute.isFilterable && attribute.resolutionStatus !== "unresolved",
        valueType: attribute.valueType,
      }));
      const datasheet = aggregate.documents.find((document) => document.documentType === "datasheet")
        ?? createAttributeDatasheet(aggregate.product.id, projectedAttributes);
      return this.toProductDetailDto(
        aggregate.product,
        aggregate.images,
        datasheet && !aggregate.documents.some((document) => document.id === datasheet.id)
          ? [...aggregate.documents, datasheet]
          : aggregate.documents,
        createBrandMap(aggregate.brand ? [aggregate.brand] : []),
        createCategoryMap(aggregate.category ? [aggregate.category] : []),
        projectedAttributes.filter((attribute) => !isDatasheetAttribute(attribute.label)),
        datasheet,
      );
    }
    const demoProduct = demoProducts.find((item) => item.id === id);
    return demoProduct ? this.toProductDetailDto(
      demoProduct,
      demoImages.filter((image) => image.productId === id),
      demoDocuments.filter((document) => document.productId === id),
      createBrandMap(demoBrands),
      createCategoryMap(demoCategories),
    ) : null;
  }

  async getProductsByIds(
    userId: string,
    productIds: string[],
  ): Promise<CatalogProductCardDto[]> {
    await this.ensureCatalogAccess(userId);
    const normalizedIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) return [];

    const [products, brands, categories] = await Promise.all([
      this.catalogRepository.listProducts({ productIds: normalizedIds }),
      this.catalogRepository.listBrands(),
      this.catalogRepository.listCategories(),
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const brandMap = createBrandMap(brands);
    const categoryMap = createCategoryMap(categories);

    return normalizedIds.flatMap((id) => {
      const product = productMap.get(id);
      return product ? [this.toProductCardDto(product, brandMap, categoryMap)] : [];
    });
  }

  async getProductOrderIdentities(
    userId: string,
    productIds: string[],
  ): Promise<CatalogProductOrderIdentityDto[]> {
    await this.ensureCatalogAccess(userId);
    const normalizedIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) return [];
    const products = await this.catalogRepository.listProducts({ productIds: normalizedIds });
    const productsById = new Map(products.map((product) => [product.id, product]));
    return normalizedIds.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [{ id, external1cId: product.external1cId, sku: product.sku, name: product.name }] : [];
    });
  }

  private async ensureCatalogAccess(userId: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
      return "";
    }

    await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership.companyId,
    );
    return activeMembership.companyId;
  }

  private async isCatalogEmpty(): Promise<boolean> {
    const products = await this.catalogRepository.listProducts({
      limit: 1,
      offset: 0,
    });

    return products.length === 0;
  }

  private toProductCardDto(
    product: CatalogProduct,
    brandMap: Map<string, CatalogBrand>,
    categoryMap: Map<string, CatalogCategory>,
    datasheet: CatalogProductDocument | null = null,
    keyCharacteristics: CatalogProductCharacteristicDto[] = [],
  ): CatalogProductCardDto {
    const brand = product.brandId
      ? brandMap.get(product.brandId) ?? null
      : null;
    const category = product.categoryId
      ? categoryMap.get(product.categoryId) ?? null
      : null;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      imageUrl: product.imageSourceUrl ?? product.imageUrl,
      brand: brand ? toBrandDto(brand) : null,
      category: category ? toCategoryDto(category) : null,
      keyCharacteristics,
      datasheet: datasheet ? {
        id: datasheet.id,
        title: datasheet.title,
        documentType: datasheet.documentType,
        url: datasheet.url,
      } : null,
    };
  }

  private toProductDetailDto(
    product: CatalogProduct,
    images: CatalogProductImage[],
    documents: CatalogProductDocument[],
    brandMap: Map<string, CatalogBrand>,
    categoryMap: Map<string, CatalogCategory>,
    keyCharacteristics: Array<{ label: string; value: string }> = [],
    datasheet: CatalogProductDocument | null = null,
  ): CatalogProductDetailDto {
    return {
      ...this.toProductCardDto(product, brandMap, categoryMap, datasheet, keyCharacteristics),
      description: product.fullDescription ?? product.description,
      images: images.map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.altText,
        isPrimary: image.isPrimary,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        documentType: document.documentType,
        url: document.url,
      })),
    };
  }
}

function isDatasheetAttribute(label: string): boolean {
  return label.trim().toLowerCase() === "datasheeturl";
}

function normalizeCharacteristicValue(value: string, valueType: string | null): string {
  const normalized = value.trim();
  if (valueType?.toLowerCase() === "boolean" || /^(true|false)$/i.test(normalized)) {
    return /^(true|1|yes|да)$/i.test(normalized) ? "Да" : "Нет";
  }
  return normalized;
}

function createAttributeDatasheet(
  productId: string,
  attributes: Array<{ label: string; value: string }>,
): CatalogProductDocument | null {
  const value = attributes.find((attribute) => isDatasheetAttribute(attribute.label))?.value.trim();

  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    return {
      id: `attribute-datasheet-${productId}`,
      productId,
      title: "Datasheet",
      documentType: "datasheet",
      url: url.toString(),
      sortOrder: 0,
      isActive: true,
      createdAt: "",
    };
  } catch {
    return null;
  }
}

function normalizeAttributeFilters(filters: Record<string, string[]> | undefined): Record<string, string[]> { return Object.fromEntries(Object.entries(filters ?? {}).flatMap(([key, values]) => { const clean = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0 && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)))].slice(0, 20); return /^property_[0-9a-f-]{36}$/.test(key) && clean.length ? [[key, clean]] : []; })); }
function intersectProductIds(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  const rightIds = new Set(right);
  return left.filter((id) => rightIds.has(id));
}
function toPublicCommercialView(view: ProductCommercialInternalDto): ProductCommercialViewDto {
  const { retailBelowPartnerPrice: _internalDiagnostic, ...publicView } = view;
  return publicView;
}
function filterCommercialViews(
  views: ProductCommercialViewDto[],
  products: CatalogProduct[],
): ProductCommercialViewDto[] {
  const productIds = new Set(products.map((product) => product.id));
  return views.filter((view) => productIds.has(view.productId));
}
const FACET_PRIORITY = [/разрешение/i, /форм.?фактор/i, /технолог/i, /передача.?данных/i, /аналитик/i, /micro.?sd/i, /дальность.?ик/i, /микрофон/i, /объектив/i, /фокус/i, /материал/i];
function buildFacets(rows: Array<{ key: string; label: string; value: string; count: number; coverage: number }>, selected: Record<string, string[]>): CatalogFacetDto[] {
  const groups = new Map<string, CatalogFacetDto>();
  for (const row of rows) { const group = groups.get(row.key) ?? { key: row.key, label: row.label, values: [] }; group.values.push({ value: row.value, count: row.count, selected: selected[row.key]?.includes(row.value) ?? false }); groups.set(row.key, group); }
  const candidates = [...groups.values()].filter((group) => group.values.length >= 2 && group.values.length <= 30).map((group) => ({ ...group, values: sortFacetValues(group.values) }));
  return deduplicateCatalogFacets(candidates).sort((a, b) => facetRank(a.label) - facetRank(b.label) || facetTotal(b) - facetTotal(a) || a.label.localeCompare(b.label));
}
export function deduplicateCatalogFacets(candidates: CatalogFacetDto[]): CatalogFacetDto[] {
  const uniqueByLabel = new Map<string, CatalogFacetDto>();
  for (const candidate of candidates) {
    const labelKey = candidate.label.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
    const existing = uniqueByLabel.get(labelKey);
    const candidateSelected = candidate.values.some((value) => value.selected);
    const existingSelected = existing?.values.some((value) => value.selected) ?? false;
    if (!existing || (candidateSelected && !existingSelected) || (!existingSelected && facetTotal(candidate) > facetTotal(existing))) uniqueByLabel.set(labelKey, candidate);
  }
  return [...uniqueByLabel.values()];
}
function facetTotal(facet: CatalogFacetDto): number { return facet.values.reduce((sum, value) => sum + value.count, 0); }
function facetRank(label: string): number { const index = FACET_PRIORITY.findIndex((pattern) => pattern.test(label)); return index < 0 ? FACET_PRIORITY.length : index; }
function sortFacetValues<T extends { value: string; count: number }>(values: T[]): T[] { return [...values].sort((a, b) => { const an = Number(a.value.replace(",", ".").match(/-?\d+(?:\.\d+)?/)?.[0]); const bn = Number(b.value.replace(",", ".").match(/-?\d+(?:\.\d+)?/)?.[0]); if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn; if (/^(да|yes|true)$/i.test(a.value)) return -1; if (/^(да|yes|true)$/i.test(b.value)) return 1; return b.count - a.count || a.value.localeCompare(b.value); }); }

function createBrandMap(brands: CatalogBrand[]): Map<string, CatalogBrand> {
  return new Map(brands.map((brand) => [brand.id, brand]));
}

const CARD_HIGHLIGHT_PRIORITY = [/разрешение/i, /poe/i, /wi-?fi/i, /ptz/i, /микрофон/i, /micro.?sd/i, /форм.?фактор/i];
function selectCardHighlights<T extends { label: string; displayValue: string }>(attributes: T[]): T[] { return attributes.filter((item) => item.displayValue).sort((a, b) => highlightRank(a.label) - highlightRank(b.label) || a.label.localeCompare(b.label)).slice(0, 2); }
function highlightRank(label: string): number { const index = CARD_HIGHLIGHT_PRIORITY.findIndex((pattern) => pattern.test(label)); return index < 0 ? CARD_HIGHLIGHT_PRIORITY.length : index; }

function createCategoryMap(
  categories: CatalogCategory[],
): Map<string, CatalogCategory> {
  return new Map(categories.map((category) => [category.id, category]));
}

function collectCategoryAndDescendantIds(
  categoryId: string,
  categories: CatalogCategory[],
): string[] {
  const result = new Set([categoryId]);
  for (let depth = 0; depth < 2; depth += 1) {
    for (const category of categories) {
      if (category.parentId && result.has(category.parentId)) result.add(category.id);
    }
  }
  return [...result];
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

function toCategoryDto(category: CatalogCategory): CatalogCategoryDto {
  return {
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    slug: category.slug,
    description: category.description,
  };
}

function toBrandDto(brand: CatalogBrand): CatalogBrandDto {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    logoUrl: brand.logoUrl,
  };
}

function filterDemoProducts(input: CatalogProductListInput): CatalogProduct[] {
  const search = input.search?.trim().toLowerCase();

  return demoProducts.filter((product) => {
    if (input.categoryId && product.categoryId !== input.categoryId) {
      return false;
    }

    if (input.brandId && product.brandId !== input.brandId) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      (product.shortDescription ?? "").toLowerCase().includes(search)
    );
  });
}

const now = "2026-07-09T00:00:00.000Z";

const demoCategories: CatalogCategory[] = [
  {
    id: "demo-category-video",
    external1cId: null,
    parentId: null,
    name: "Video surveillance",
    slug: "video-surveillance",
    description: "Cameras and video security devices.",
    sortOrder: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-category-access",
    external1cId: null,
    parentId: null,
    name: "Access control",
    slug: "access-control",
    description: "Readers, controllers, and entry security devices.",
    sortOrder: 20,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-category-network",
    external1cId: null,
    parentId: null,
    name: "Network infrastructure",
    slug: "network-infrastructure",
    description: "Switches and connectivity equipment.",
    sortOrder: 30,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const demoBrands: CatalogBrand[] = [
  {
    id: "demo-brand-axis",
    external1cId: null,
    name: "Axis",
    slug: "axis",
    description: "Professional security devices.",
    logoUrl: null,
    sortOrder: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-brand-hikvision",
    external1cId: null,
    name: "Hikvision",
    slug: "hikvision",
    description: "Video and access-control equipment.",
    logoUrl: null,
    sortOrder: 20,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-brand-ubiquiti",
    external1cId: null,
    name: "Ubiquiti",
    slug: "ubiquiti",
    description: "Network infrastructure devices.",
    logoUrl: null,
    sortOrder: 30,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const demoProducts: CatalogProduct[] = [
  {
    id: "demo-product-dome-camera",
    external1cId: "DEMO-CAT-001",
    categoryId: "demo-category-video",
    brandId: "demo-brand-axis",
    sku: "CAM-DOME-4MP",
    name: "4MP Indoor Dome Camera",
    slug: "4mp-indoor-dome-camera",
    shortDescription: "Compact indoor camera for professional installations.",
    description:
      "A safe demo catalog item for browsing flow validation. Official product data will come from the approved source after synchronization is implemented.",
    imageUrl: null,
    isActive: true,
    isVisible: true,
    sortOrder: 10,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-product-controller",
    external1cId: "DEMO-CAT-002",
    categoryId: "demo-category-access",
    brandId: "demo-brand-hikvision",
    sku: "ACC-CTRL-2D",
    name: "Two-Door Access Controller",
    slug: "two-door-access-controller",
    shortDescription: "Controller foundation for secure entry projects.",
    description:
      "A safe demo access-control item with product identity and descriptive metadata only.",
    imageUrl: null,
    isActive: true,
    isVisible: true,
    sortOrder: 20,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "demo-product-poe-switch",
    external1cId: "DEMO-CAT-003",
    categoryId: "demo-category-network",
    brandId: "demo-brand-ubiquiti",
    sku: "NET-POE-16",
    name: "16-Port PoE Switch",
    slug: "16-port-poe-switch",
    shortDescription: "Network switch for camera and access installations.",
    description:
      "A safe demo network item used only when the catalog read model is empty.",
    imageUrl: null,
    isActive: true,
    isVisible: true,
    sortOrder: 30,
    createdAt: now,
    updatedAt: now,
  },
];

const demoImages: CatalogProductImage[] = demoProducts.map((product) => ({
  id: `${product.id}-image`,
  productId: product.id,
  url: "",
  altText: product.name,
  sortOrder: 0,
  isPrimary: true,
  createdAt: now,
}));

const demoDocuments: CatalogProductDocument[] = demoProducts.map((product) => ({
  id: `${product.id}-document`,
  productId: product.id,
  title: "Product overview",
  documentType: "datasheet",
  url: "#",
  sortOrder: 0,
  isActive: true,
  createdAt: now,
}));
