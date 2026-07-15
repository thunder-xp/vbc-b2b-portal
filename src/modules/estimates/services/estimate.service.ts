import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { AddEstimateLineInput, EstimateRepository } from "../repositories";
import { EstimateRepositoryError } from "../repositories";
import type { Estimate, EstimateItem, EstimateStatus, EstimateUnit } from "../types";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const PRICING_PERMISSION = "estimates.pricing.manage";
const PAGE_SIZE = 20;
const MAX_PRODUCT_BATCH = 50;

export type EstimateListFilters = {
  search?: string;
  status?: EstimateStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
};

export type EstimateSummaryDto = {
  id: string;
  estimateNumber: string;
  name: string;
  customerProject: string;
  status: EstimateStatus;
  total: string;
  currencyCode: string;
  updatedAt: string;
  revision: number;
  createdByName: string;
  itemCount: number;
};

export type EstimateLineDto = {
  id: string;
  lineType: EstimateItem["lineType"];
  productId: string | null;
  position: number;
  sku: string | null;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  unitLabel: string;
  sourcePrice: string | null;
  sellingUnitPrice: number | null;
  formattedSellingUnitPrice: string | null;
  lineTotal: string | null;
};

export type EstimateDetailDto = {
  id: string;
  estimateNumber: string;
  name: string;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  validityDays: number;
  status: EstimateStatus;
  revision: number;
  updatedAt: string;
  total: string;
  hasIncompletePricing: boolean;
  itemCount: number;
  lines: EstimateLineDto[];
};

export type EstimateServiceDto = {
  id: string;
  name: string;
  description: string | null;
  defaultUnit: EstimateUnit;
  unitLabel: string;
};

export type EstimateProductPickerDto = {
  products: Array<{
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    categoryName: string | null;
    brandName: string | null;
    partnerPrice: string | null;
    stock: string;
    expectedArrival: string | null;
  }>;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
};

export type CreateEstimateCommand = {
  name: string;
  customerName?: string | null;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
};

export type SaveEstimateCommand = Omit<CreateEstimateCommand, "currencyCode"> & {
  expectedRevision: number;
};

export interface EstimateService {
  list(userId: string, filters: EstimateListFilters): Promise<{ records: EstimateSummaryDto[]; page: number; totalPages: number; totalCount: number }>;
  listAvailableCurrencies(userId: string): Promise<string[]>;
  listServices(userId: string): Promise<EstimateServiceDto[]>;
  searchProducts(userId: string, input: { search?: string; categoryId?: string; brandId?: string }): Promise<EstimateProductPickerDto>;
  createDraft(userId: string, input: CreateEstimateCommand): Promise<Estimate>;
  getDetail(userId: string, estimateId: string): Promise<EstimateDetailDto>;
  saveDraft(userId: string, estimateId: string, input: SaveEstimateCommand): Promise<EstimateDetailDto>;
  addProducts(userId: string, estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>): Promise<EstimateDetailDto>;
  addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto>;
  addCustomLine(userId: string, estimateId: string, expectedRevision: number, description: string, unit: EstimateUnit, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto>;
  updateLine(userId: string, estimateId: string, itemId: string, expectedRevision: number, input: { description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<EstimateDetailDto>;
  removeLine(userId: string, estimateId: string, itemId: string, expectedRevision: number): Promise<EstimateDetailDto>;
  archive(userId: string, estimateId: string, expectedRevision: number): Promise<void>;
}

export class DefaultEstimateService implements EstimateService {
  constructor(
    private readonly repository: EstimateRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async list(userId: string, filters: EstimateListFilters) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const page = normalizePage(filters.page);
    const result = await this.repository.list({
      companyId,
      search: normalizeOptional(filters.search, 100),
      status: normalizeStatus(filters.status),
      dateFrom: normalizeDate(filters.dateFrom),
      dateTo: endExclusive(filters.dateTo),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return {
      records: result.records.map((record) => ({
        id: record.id,
        estimateNumber: record.estimateNumber,
        name: record.name,
        customerProject: [record.customerName, record.projectName].filter(Boolean).join(" · ") || "Без заказчика и объекта",
        status: record.status,
        total: formatMoney(record.totalAmount, record.currencyCode),
        currencyCode: record.currencyCode,
        updatedAt: record.updatedAt,
        revision: record.revision,
        createdByName: record.createdByName,
        itemCount: record.itemCount,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
      totalCount: result.totalCount,
    };
  }

  async listAvailableCurrencies(userId: string): Promise<string[]> {
    await this.resolveCompany(userId, VIEW_PERMISSION);
    return this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
  }

  async listServices(userId: string): Promise<EstimateServiceDto[]> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    return (await this.repository.listServices(companyId)).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      defaultUnit: service.defaultUnit,
      unitLabel: unitLabel(service.defaultUnit),
    }));
  }

  async searchProducts(userId: string, input: { search?: string; categoryId?: string; brandId?: string }): Promise<EstimateProductPickerDto> {
    await this.resolveCompany(userId, VIEW_PERMISSION);
    const [result, categories, brands] = await Promise.all([
      this.catalogService.listProducts(userId, {
        search: normalizeOptional(input.search, 100),
        categoryId: normalizeOptional(input.categoryId, 50),
        brandId: normalizeOptional(input.brandId, 50),
        page: 1,
        pageSize: 12,
      }),
      this.catalogService.listCategories(userId),
      this.catalogService.listBrands(userId),
    ]);
    const commercial = await this.pricingInventoryService.getProductCommercialViews(
      userId,
      result.products.map((product) => product.id),
    );
    const commercialByProduct = new Map(commercial.map((view) => [view.productId, view]));
    return {
      products: result.products.map((product) => {
        const view = commercialByProduct.get(product.id);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          categoryName: product.category?.name ?? null,
          brandName: product.brand?.name ?? null,
          partnerPrice: view?.partnerPrice?.formattedAmount ?? null,
          stock: view?.stock?.label ?? "Наличие уточняется",
          expectedArrival: view?.stock?.expectedArrival?.formattedExpectedDate ?? null,
        };
      }),
      categories: categories.map(({ id, name }) => ({ id, name })),
      brands: brands.map(({ id, name }) => ({ id, name })),
    };
  }

  async createDraft(userId: string, input: CreateEstimateCommand): Promise<Estimate> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const currencies = await this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
    const normalized = normalizeMetadata(input);
    if (!currencies.includes(normalized.currencyCode)) {
      throw new InvalidStateError("Estimate currency is not available in published commercial data.");
    }
    return this.repository.create({ companyId, ...normalized });
  }

  async getDetail(userId: string, estimateId: string): Promise<EstimateDetailDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const aggregate = await this.repository.findAggregateById(normalizeId(estimateId));
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    return toDetail(aggregate.estimate, aggregate.items);
  }

  async saveDraft(userId: string, estimateId: string, input: SaveEstimateCommand): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, MANAGE_PERMISSION, input.expectedRevision);
    const normalized = normalizeMetadata({ ...input, currencyCode: "USD" });
    try {
      await this.repository.updateDraft({
        estimateId,
        expectedRevision: input.expectedRevision,
        name: normalized.name,
        customerName: normalized.customerName,
        projectName: normalized.projectName,
        validityDays: normalized.validityDays,
      });
    } catch (error) {
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  async addProducts(userId: string, estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>): Promise<EstimateDetailDto> {
    const estimate = await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    const quantityById = new Map<string, number>();
    for (const selection of selections) {
      const productId = selection.productId.trim();
      if (productId) quantityById.set(productId, normalizeQuantity(selection.quantity));
    }
    const ids = [...quantityById.keys()];
    if (!ids.length || ids.length > MAX_PRODUCT_BATCH) throw new InvalidStateError("Select between 1 and 50 products.");
    const [products, commercialViews] = await Promise.all([
      this.catalogService.getProductsByIds(userId, ids),
      this.pricingInventoryService.getProductCommercialViews(userId, ids),
    ]);
    if (products.length !== ids.length) throw new NotFoundError("One or more catalog products were not found.");
    const commercialByProduct = new Map(commercialViews.map((view) => [view.productId, view]));
    const lines: AddEstimateLineInput[] = products.map((product) => {
      const price = commercialByProduct.get(product.id)?.partnerPrice ?? null;
      const sameCurrency = price?.currencyCode === estimate.currencyCode;
      return {
        lineType: "product",
        productId: product.id,
        serviceId: null,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        sourceUnitPrice: price?.amount ?? null,
        sourceCurrencyCode: price?.currencyCode ?? null,
        sourceSnapshotAt: price?.lastUpdatedAt ?? null,
        description: product.name,
        quantity: quantityById.get(product.id) ?? 1,
        unit: "pcs",
        sellingUnitPrice: sameCurrency ? normalizeMoney(price.amount) : null,
      };
    });
    await this.addLinesSafely(estimateId, expectedRevision, lines);
    return this.getDetail(userId, estimateId);
  }

  async addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto> {
    const estimate = await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    const services = await this.repository.listServices(estimate.companyId);
    const service = services.find((item) => item.id === serviceId.trim());
    if (!service) throw new NotFoundError("Service was not found.");
    await this.addLinesSafely(estimateId, expectedRevision, [{
      lineType: "service",
      productId: null,
      serviceId: service.id,
      skuSnapshot: null,
      productNameSnapshot: null,
      sourceUnitPrice: null,
      sourceCurrencyCode: null,
      sourceSnapshotAt: null,
      description: service.name,
      quantity: normalizeQuantity(quantity),
      unit: service.defaultUnit,
      sellingUnitPrice: normalizeMoney(sellingUnitPrice),
    }]);
    return this.getDetail(userId, estimateId);
  }

  async addCustomLine(userId: string, estimateId: string, expectedRevision: number, description: string, unit: EstimateUnit, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    await this.addLinesSafely(estimateId, expectedRevision, [{
      lineType: "custom",
      productId: null,
      serviceId: null,
      skuSnapshot: null,
      productNameSnapshot: null,
      sourceUnitPrice: null,
      sourceCurrencyCode: null,
      sourceSnapshotAt: null,
      description: normalizeDescription(description),
      quantity: normalizeQuantity(quantity),
      unit: normalizeUnit(unit),
      sellingUnitPrice: normalizeMoney(sellingUnitPrice),
    }]);
    return this.getDetail(userId, estimateId);
  }

  async updateLine(userId: string, estimateId: string, itemId: string, expectedRevision: number, input: { description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    try {
      await this.repository.updateLine({
        estimateId,
        itemId: normalizeId(itemId),
        expectedRevision,
        description: normalizeDescription(input.description),
        unit: normalizeUnit(input.unit),
        quantity: normalizeQuantity(input.quantity),
        sellingUnitPrice: normalizeMoney(input.sellingUnitPrice),
      });
    } catch (error) {
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  async removeLine(userId: string, estimateId: string, itemId: string, expectedRevision: number): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, MANAGE_PERMISSION, expectedRevision);
    try {
      await this.repository.removeLine(estimateId, normalizeId(itemId), expectedRevision);
    } catch (error) {
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  async archive(userId: string, estimateId: string, expectedRevision: number): Promise<void> {
    await this.ensureDraft(userId, estimateId, MANAGE_PERMISSION, expectedRevision);
    try {
      await this.repository.archive(estimateId, expectedRevision);
    } catch (error) {
      handleRepositoryConflict(error);
    }
  }

  private async addLinesSafely(estimateId: string, expectedRevision: number, lines: AddEstimateLineInput[]) {
    try {
      await this.repository.addLines(estimateId, expectedRevision, lines);
    } catch (error) {
      handleRepositoryConflict(error);
    }
  }

  private async ensureDraft(userId: string, estimateId: string, permission: string, expectedRevision: number): Promise<Estimate> {
    const companyId = await this.resolveCompany(userId, permission);
    const estimate = await this.repository.findById(normalizeId(estimateId));
    if (!estimate || estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    if (estimate.status !== "draft") throw new InvalidStateError("Only draft estimates can be changed.");
    if (estimate.revision !== normalizeRevision(expectedRevision)) throw new InvalidStateError("Estimate was changed in another session. Reload before saving.");
    return estimate;
  }

  private async resolveCompany(userId: string, permission: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

function normalizeMetadata(input: CreateEstimateCommand) {
  const name = normalizeRequired(input.name, 200, "Estimate name is invalid.");
  const customerName = normalizeOptional(input.customerName ?? undefined, 200) ?? null;
  const projectName = normalizeOptional(input.projectName ?? undefined, 200) ?? null;
  const currencyCode = input.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new InvalidStateError("Estimate currency is invalid.");
  if (!Number.isInteger(input.validityDays) || input.validityDays < 1 || input.validityDays > 365) throw new InvalidStateError("Validity period is invalid.");
  return { name, customerName, projectName, currencyCode, validityDays: input.validityDays };
}

function normalizeQuantity(value: number): number {
  const decimal = decimalValue(value, "Quantity is invalid.");
  if (decimal.lte(0) || decimal.gt(999999) || decimal.decimalPlaces() > 3) throw new InvalidStateError("Quantity is invalid.");
  return decimal.toNumber();
}

function normalizeMoney(value: number): number {
  const decimal = decimalValue(value, "Selling price is invalid.");
  if (decimal.lt(0) || decimal.gt("9999999999999999.99")) throw new InvalidStateError("Selling price is invalid.");
  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

function decimalValue(value: number, message: string): Decimal {
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) throw new Error();
    return decimal;
  } catch {
    throw new InvalidStateError(message);
  }
}

function normalizeDescription(value: string): string {
  return normalizeRequired(value, 2000, "Line description is invalid.");
}

function normalizeRequired(value: string, maxLength: number, message: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new InvalidStateError(message);
  return normalized;
}

function normalizeOptional(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new InvalidStateError("Submitted text is too long.");
  return normalized;
}

function normalizeUnit(value: EstimateUnit): EstimateUnit {
  if (!(["pcs", "hour", "meter", "set", "visit", "service"] as const).includes(value)) throw new InvalidStateError("Line unit is invalid.");
  return value;
}

function normalizeStatus(value: EstimateStatus | undefined): EstimateStatus | undefined {
  return value && (["draft", "ready", "sent", "accepted", "rejected", "archived"] as const).includes(value) ? value : undefined;
}

function normalizeId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new NotFoundError("Estimate was not found.");
  return normalized;
}

function normalizeRevision(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new InvalidStateError("Estimate revision is invalid.");
  return value;
}

function normalizePage(value: number | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endExclusive(value: string | undefined): string | undefined {
  const normalized = normalizeDate(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function toDetail(estimate: Estimate, items: EstimateItem[]): EstimateDetailDto {
  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    name: estimate.name,
    customerName: estimate.customerName,
    projectName: estimate.projectName,
    currencyCode: estimate.currencyCode,
    validityDays: estimate.validityDays,
    status: estimate.status,
    revision: estimate.revision,
    updatedAt: estimate.updatedAt,
    total: formatMoney(estimate.totalAmount, estimate.currencyCode),
    hasIncompletePricing: estimate.hasIncompletePricing,
    itemCount: items.length,
    lines: items.map((item) => ({
      id: item.id,
      lineType: item.lineType,
      productId: item.productId,
      position: item.position,
      sku: item.skuSnapshot,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitLabel: unitLabel(item.unit),
      sourcePrice: item.sourceUnitPrice === null || !item.sourceCurrencyCode ? null : formatMoney(item.sourceUnitPrice, item.sourceCurrencyCode),
      sellingUnitPrice: item.sellingUnitPrice,
      formattedSellingUnitPrice: item.sellingUnitPrice === null ? null : formatMoney(item.sellingUnitPrice, estimate.currencyCode),
      lineTotal: item.lineTotal === null ? null : formatMoney(item.lineTotal, estimate.currencyCode),
    })),
  };
}

function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currencyCode, minimumFractionDigits: 2 }).format(amount);
}

function unitLabel(unit: EstimateUnit): string {
  return ({ pcs: "шт.", hour: "час", meter: "метр", set: "комплект", visit: "выезд", service: "услуга" } as const)[unit];
}

function handleRepositoryConflict(error: unknown): never {
  if (error instanceof EstimateRepositoryError && error.code === "conflict") {
    throw new InvalidStateError("Estimate was changed in another session. Reload before saving.");
  }
  if (error instanceof EstimateRepositoryError && error.code === "not_found") throw new NotFoundError("Estimate was not found.");
  throw error;
}
