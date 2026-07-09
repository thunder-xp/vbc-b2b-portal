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
};

export type CatalogProductCardDto = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  brand: CatalogBrandDto | null;
  category: CatalogCategoryDto | null;
};

export type CatalogProductListResult = {
  products: CatalogProductCardDto[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  isDemoData: boolean;
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
    const repositoryInput: ListCatalogProductsInput = {
      categoryId: input.categoryId,
      brandId: input.brandId,
      search: input.search,
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
    };
    const products = await this.catalogRepository.listProducts(repositoryInput);
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
      };
    }

    const [brands, categories] = await Promise.all([
      this.catalogRepository.listBrands(),
      this.catalogRepository.listCategories(),
    ]);
    const brandMap = createBrandMap(brands);
    const categoryMap = createCategoryMap(categories);

    return {
      products: products
        .slice(0, pageSize)
        .map((product) => this.toProductCardDto(product, brandMap, categoryMap)),
      page,
      pageSize,
      hasNextPage: products.length > pageSize,
      isDemoData: false,
    };
  }

  async getProductDetailBySlug(
    userId: string,
    slug: string,
  ): Promise<CatalogProductDetailDto | null> {
    await this.ensureCatalogAccess(userId);
    const product = await this.catalogRepository.getProductBySlug(slug);

    if (product) {
      const [images, documents, brands, categories] = await Promise.all([
        this.catalogRepository.listProductImages(product.id),
        this.catalogRepository.listProductDocuments(product.id),
        this.catalogRepository.listBrands(),
        this.catalogRepository.listCategories(),
      ]);

      return this.toProductDetailDto(
        product,
        images,
        documents,
        createBrandMap(brands),
        createCategoryMap(categories),
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
      imageUrl: product.imageUrl,
      brand: brand ? toBrandDto(brand) : null,
      category: category ? toCategoryDto(category) : null,
    };
  }

  private toProductDetailDto(
    product: CatalogProduct,
    images: CatalogProductImage[],
    documents: CatalogProductDocument[],
    brandMap: Map<string, CatalogBrand>,
    categoryMap: Map<string, CatalogCategory>,
  ): CatalogProductDetailDto {
    return {
      ...this.toProductCardDto(product, brandMap, categoryMap),
      description: product.description,
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

function createBrandMap(brands: CatalogBrand[]): Map<string, CatalogBrand> {
  return new Map(brands.map((brand) => [brand.id, brand]));
}

function createCategoryMap(
  categories: CatalogCategory[],
): Map<string, CatalogCategory> {
  return new Map(categories.map((category) => [category.id, category]));
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
