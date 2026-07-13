import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogRepository, ListCatalogProductsInput } from "../repositories";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
} from "../types";

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
  sort?: "default" | "name_asc" | "name_desc" | "sku_asc";
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
  keyCharacteristics: Array<{ label: string; value: string }>;
  datasheet: CatalogProductDocumentDto | null;
};

export type CatalogProductListResult = {
  products: CatalogProductCardDto[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  isDemoData: boolean;
  totalCount: number;
  facets: CatalogFacetDto[];
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
  getProductsByIds(
    userId: string,
    productIds: string[],
  ): Promise<CatalogProductCardDto[]>;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

export class DefaultCatalogService implements CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly companyAccessService: CompanyAccessService,
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
    await this.ensureCatalogAccess(userId);
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const [brands, categories] = await Promise.all([
      this.catalogRepository.listBrands(),
      this.catalogRepository.listCategories(),
    ]);
    const categoryIds = input.categoryId
      ? collectCategoryAndDescendantIds(input.categoryId, categories)
      : undefined;
    const attributeFilters = normalizeAttributeFilters(input.attributeFilters);
    const [attributeProductIds, facetRows] = await Promise.all([
      Object.keys(attributeFilters).length ? this.catalogRepository.findMatchingProductIds?.(categoryIds, attributeFilters) ?? Promise.resolve([]) : Promise.resolve(undefined),
      this.catalogRepository.listAttributeFacets?.(categoryIds, attributeFilters) ?? Promise.resolve([]),
    ]);
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
      sort: input.sort,
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
      productIds: matchingProductIds,
    };
    const [products, totalCount] = await Promise.all([
      this.catalogRepository.listProducts(repositoryInput),
      this.catalogRepository.countProducts(repositoryInput),
    ]);
    const isEmptyCatalog = products.length === 0 && (await this.isCatalogEmpty());

    if (isEmptyCatalog) {
      const filteredDemoProducts = filterDemoProducts(input);
      const start = (page - 1) * pageSize;
      const pagedDemoProducts = filteredDemoProducts.slice(
        start,
        start + pageSize + 1,
      );
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
      };
    }
    const brandMap = createBrandMap(brands);
    const categoryMap = createCategoryMap(categories);
    const visibleProducts = products.slice(0, pageSize);
    const documents = await this.catalogRepository.listProductDocumentsForProducts(
      visibleProducts.map((product) => product.id),
    );
    const attributes = await this.catalogRepository.listProductAttributesForProducts?.(visibleProducts.map((product) => product.id)) ?? [];
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
      hasNextPage: products.length > pageSize,
      isDemoData: false,
      totalCount,
      facets: buildFacets(facetRows, attributeFilters),
    };
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
        label: attribute.label,
        value: attribute.displayValue,
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

  private async ensureCatalogAccess(userId: string): Promise<void> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const activeMembership = memberships.find(
      (membership) => membership.status === MembershipStatus.Active,
    );

    if (!activeMembership) {
      await this.companyAccessService.getActiveCompanyContext(userId, "");
      return;
    }

    await this.companyAccessService.getActiveCompanyContext(
      userId,
      activeMembership.companyId,
    );
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
    keyCharacteristics: Array<{ label: string; value: string }> = [],
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
