import type {
  CatalogProvider,
  DocumentProvider,
  DocumentFetchRequestDTO,
  ERPProviderHealth,
  FinanceFetchRequestDTO,
  FinanceProvider,
  InventoryProvider,
  OrderProvider,
  PartnerProvider,
  PricingProvider,
  ProductPriceFetchRequestDTO,
  SalesOrderStatusFetchRequestDTO,
  StockBalanceFetchRequestDTO,
} from "../../contracts";
import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
  DocumentDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  InvoiceDTO,
  PartnerCompanyDTO,
  ProductPriceDTO,
  SalesOrderDTO,
  SalesOrderExportResultDTO,
  StockBalanceDTO,
} from "../../dto";
import { IntegrationUnsupportedOperationError } from "../../errors";
import { AbstractERPProvider } from "../abstract-erp-provider";
import { DefaultOneCCatalogMapper } from "./one-c-catalog.mapper";
import {
  ONE_C_PROVIDER_CODE,
  oneCProviderDefaultCapabilities,
  type OneCProviderConfig,
} from "./one-c-provider.config";
import type {
  OneCCatalogBrandPayload,
  OneCCatalogCategoryPayload,
  OneCCatalogProductPayload,
  OneCCatalogResponsePayload,
} from "./one-c-provider.types";

export class IntegrationProviderNotImplementedError extends IntegrationUnsupportedOperationError {
  constructor(operation: string) {
    super(`${operation} is not implemented for the 1C provider.`);
    this.name = "IntegrationProviderNotImplementedError";
  }
}

export class OneCProvider extends AbstractERPProvider {
  readonly providerCode = ONE_C_PROVIDER_CODE;
  readonly capabilities: OneCProviderConfig["capabilities"];
  readonly catalog: CatalogProvider;
  readonly pricing: PricingProvider;
  readonly inventory: InventoryProvider;
  readonly orders: OrderProvider;
  readonly documents: DocumentProvider;
  readonly finance: FinanceProvider;
  readonly partners: PartnerProvider;
  private readonly config: OneCProviderConfig;

  constructor(config: Partial<OneCProviderConfig> = {}) {
    super();
    this.config = {
      providerCode: ONE_C_PROVIDER_CODE,
      displayName: "1C ERP",
      capabilities: config.capabilities ?? oneCProviderDefaultCapabilities,
      requestTimeoutMs: config.requestTimeoutMs ?? 15000,
      baseUrl: config.baseUrl ?? null,
      apiToken: config.apiToken ?? null,
      username: config.username ?? null,
      password: config.password ?? null,
      catalogCategoriesPath:
        config.catalogCategoriesPath ?? "/catalog/categories",
      catalogBrandsPath: config.catalogBrandsPath ?? "/catalog/brands",
      catalogProductsPath: config.catalogProductsPath ?? "/catalog/products",
      useMockCatalog: config.useMockCatalog ?? true,
    };
    this.capabilities = this.config.capabilities;
    this.catalog = new OneCCatalogProvider(this.config);
    this.pricing = new OneCPricingProvider();
    this.inventory = new OneCInventoryProvider();
    this.orders = new OneCOrderProvider();
    this.documents = new OneCDocumentProvider();
    this.finance = new OneCFinanceProvider();
    this.partners = new OneCPartnerProvider();
  }

  async checkHealth(): Promise<ERPProviderHealth> {
    throw new IntegrationProviderNotImplementedError("1C provider health check");
  }
}

class OneCCatalogProvider implements CatalogProvider {
  private readonly mapper = new DefaultOneCCatalogMapper();

  constructor(private readonly config: OneCProviderConfig) {}

  async fetchCategories(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogCategoryDTO>> {
    const response = this.config.useMockCatalog
      ? mockCatalogCategories
      : await requestOneCCatalog<OneCCatalogCategoryPayload>(
          this.config,
          this.config.catalogCategoriesPath,
          input,
          isCategoryPayload,
        );

    return {
      items: response.items.map(this.mapper.categoryMapper.toPlatformDTO),
      nextCursor: response.nextCursor ?? null,
    };
  }

  async fetchBrands(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogBrandDTO>> {
    const response = this.config.useMockCatalog
      ? mockCatalogBrands
      : await requestOneCCatalog<OneCCatalogBrandPayload>(
          this.config,
          this.config.catalogBrandsPath,
          input,
          isBrandPayload,
        );

    return {
      items: response.items.map(this.mapper.brandMapper.toPlatformDTO),
      nextCursor: response.nextCursor ?? null,
    };
  }

  async fetchProducts(
    input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<CatalogProductDTO>> {
    const response = this.config.useMockCatalog
      ? mockCatalogProducts
      : await requestOneCCatalog<OneCCatalogProductPayload>(
          this.config,
          this.config.catalogProductsPath,
          input,
          isProductPayload,
        );

    return {
      items: response.items.map(this.mapper.productMapper.toPlatformDTO),
      nextCursor: response.nextCursor ?? null,
    };
  }
}

class OneCPricingProvider implements PricingProvider {
  async fetchProductPrices(
    _input: ProductPriceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<ProductPriceDTO>> {
    throw new IntegrationProviderNotImplementedError("1C price import");
  }
}

class OneCInventoryProvider implements InventoryProvider {
  async fetchStockBalances(
    _input: StockBalanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<StockBalanceDTO>> {
    throw new IntegrationProviderNotImplementedError("1C inventory import");
  }
}

class OneCOrderProvider implements OrderProvider {
  async exportSalesOrder(
    _order: SalesOrderDTO,
  ): Promise<SalesOrderExportResultDTO> {
    throw new IntegrationProviderNotImplementedError("1C order export");
  }

  async fetchSalesOrders(
    _input: SalesOrderStatusFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<SalesOrderDTO>> {
    throw new IntegrationProviderNotImplementedError("1C order status import");
  }
}

class OneCDocumentProvider implements DocumentProvider {
  async fetchDocuments(
    _input: DocumentFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<DocumentDTO>> {
    throw new IntegrationProviderNotImplementedError("1C document import");
  }
}

class OneCFinanceProvider implements FinanceProvider {
  async fetchFinanceSnapshots(
    _input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>> {
    throw new IntegrationProviderNotImplementedError("1C finance import");
  }

  async fetchInvoices(
    _input: FinanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<InvoiceDTO>> {
    throw new IntegrationProviderNotImplementedError("1C invoice import");
  }
}

class OneCPartnerProvider implements PartnerProvider {
  async fetchPartnerCompanies(
    _input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<PartnerCompanyDTO>> {
    throw new IntegrationProviderNotImplementedError("1C partner import");
  }
}

async function requestOneCCatalog<TPayload>(
  config: OneCProviderConfig,
  path: string,
  input: IntegrationSyncWindowDTO,
  isPayload: (value: unknown) => value is TPayload,
): Promise<OneCCatalogResponsePayload<TPayload>> {
  if (!config.baseUrl) {
    throw new IntegrationProviderNotImplementedError(
      "1C catalog endpoint configuration",
    );
  }

  const url = new URL(path, config.baseUrl);

  if (input.changedSince) {
    url.searchParams.set("changedSince", input.changedSince);
  }

  if (input.page?.limit !== undefined) {
    url.searchParams.set("limit", String(input.page.limit));
  }

  if (input.page?.cursor) {
    url.searchParams.set("cursor", input.page.cursor);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(config),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new IntegrationProviderNotImplementedError(
      `1C catalog request failed with status ${response.status}`,
    );
  }

  const payload: unknown = await response.json();
  return parseCatalogResponse(payload, isPayload);
}

function buildHeaders(config: OneCProviderConfig): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (config.apiToken) {
    headers.Authorization = `Bearer ${config.apiToken}`;
    return headers;
  }

  if (config.username && config.password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.username}:${config.password}`,
      "utf8",
    ).toString("base64")}`;
  }

  return headers;
}

function parseCatalogResponse<TPayload>(
  payload: unknown,
  isPayload: (value: unknown) => value is TPayload,
): OneCCatalogResponsePayload<TPayload> {
  if (Array.isArray(payload)) {
    return {
      items: payload.filter(isPayload),
      nextCursor: null,
    };
  }

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new IntegrationProviderNotImplementedError(
      "1C catalog response parsing",
    );
  }

  return {
    items: payload.items.filter(isPayload),
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReference(value: unknown): value is { ref: string; type: string } {
  return (
    isRecord(value) &&
    typeof value.ref === "string" &&
    typeof value.type === "string"
  );
}

function isMetadata(value: unknown): value is { sourceUpdatedAt: string | null } {
  return (
    isRecord(value) &&
    (typeof value.sourceUpdatedAt === "string" ||
      value.sourceUpdatedAt === null)
  );
}

function isCategoryPayload(value: unknown): value is OneCCatalogCategoryPayload {
  return (
    isRecord(value) &&
    isReference(value.reference) &&
    (isReference(value.parentReference) || value.parentReference === null) &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    typeof value.active === "boolean" &&
    isMetadata(value.metadata)
  );
}

function isBrandPayload(value: unknown): value is OneCCatalogBrandPayload {
  return (
    isRecord(value) &&
    isReference(value.reference) &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    (typeof value.logoUrl === "string" || value.logoUrl === null) &&
    typeof value.active === "boolean" &&
    isMetadata(value.metadata)
  );
}

function isProductPayload(value: unknown): value is OneCCatalogProductPayload {
  return (
    isRecord(value) &&
    isReference(value.reference) &&
    (isReference(value.categoryReference) || value.categoryReference === null) &&
    (isReference(value.brandReference) || value.brandReference === null) &&
    typeof value.sku === "string" &&
    typeof value.name === "string" &&
    (typeof value.shortDescription === "string" ||
      value.shortDescription === null) &&
    (typeof value.description === "string" || value.description === null) &&
    (typeof value.imageUrl === "string" || value.imageUrl === null) &&
    typeof value.active === "boolean" &&
    typeof value.visible === "boolean" &&
    isMetadata(value.metadata)
  );
}

const mockCatalogCategories: OneCCatalogResponsePayload<OneCCatalogCategoryPayload> =
  {
    items: [
      {
        reference: { ref: "MOCK-CATEGORY-VIDEO", type: "catalog-category" },
        parentReference: null,
        name: "Video surveillance",
        description: "Imported demo category from configured mock catalog.",
        active: true,
        metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
      },
      {
        reference: { ref: "MOCK-CATEGORY-ACCESS", type: "catalog-category" },
        parentReference: null,
        name: "Access control",
        description: "Imported demo category from configured mock catalog.",
        active: true,
        metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
      },
    ],
    nextCursor: null,
  };

const mockCatalogBrands: OneCCatalogResponsePayload<OneCCatalogBrandPayload> = {
  items: [
    {
      reference: { ref: "MOCK-BRAND-NOVOTECH", type: "catalog-brand" },
      name: "Novotech Demo",
      description: "Imported demo brand from configured mock catalog.",
      logoUrl: null,
      active: true,
      metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
    },
  ],
  nextCursor: null,
};

const mockCatalogProducts: OneCCatalogResponsePayload<OneCCatalogProductPayload> =
  {
    items: [
      {
        reference: { ref: "MOCK-PRODUCT-CAM-001", type: "catalog-product" },
        categoryReference: {
          ref: "MOCK-CATEGORY-VIDEO",
          type: "catalog-category",
        },
        brandReference: { ref: "MOCK-BRAND-NOVOTECH", type: "catalog-brand" },
        sku: "SYNC-CAM-001",
        name: "Imported Demo Camera",
        shortDescription: "Catalog item imported through manual sync.",
        description:
          "This item demonstrates the manual catalog synchronization flow. Replace mock mode with configured 1C endpoints for production data.",
        imageUrl: null,
        active: true,
        visible: true,
        metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
      },
      {
        reference: { ref: "MOCK-PRODUCT-ACC-001", type: "catalog-product" },
        categoryReference: {
          ref: "MOCK-CATEGORY-ACCESS",
          type: "catalog-category",
        },
        brandReference: { ref: "MOCK-BRAND-NOVOTECH", type: "catalog-brand" },
        sku: "SYNC-ACC-001",
        name: "Imported Demo Access Controller",
        shortDescription: "Catalog item imported through manual sync.",
        description:
          "This item demonstrates the manual catalog synchronization flow. Replace mock mode with configured 1C endpoints for production data.",
        imageUrl: null,
        active: true,
        visible: true,
        metadata: { sourceUpdatedAt: "2026-07-09T00:00:00.000Z" },
      },
    ],
    nextCursor: null,
  };
