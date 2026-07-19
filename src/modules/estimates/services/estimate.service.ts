import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { AddEstimateLineInput, EstimateRepository, SaveEstimateCommercialInput } from "../repositories";
import { EstimateRepositoryError } from "../repositories";
import type { Estimate, EstimateAggregate, EstimateChargeType, EstimateCurrencyChangePolicy, EstimateItem, EstimatePricingMode, EstimateStatus, EstimateUnit, EstimateVatMode } from "../types";
import { calculateCommercialLine, calculateEstimateCommercials, convertMoney, resolveCurrencyRate } from "./commercial-calculation";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const PRICING_PERMISSION = "estimates.pricing.manage";
const PAGE_SIZE = 20;
const MAX_PRODUCT_BATCH = 50;

export type EstimateListFilters = {
  search?: string;
  status?: EstimateStatus;
  versionStatus?: import("../types").EstimateVersionStatus | "has_sent";
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
  versionCount: number;
  latestVersionStatus: import("../types").EstimateVersionStatus | null;
  hasAcceptedVersion: boolean;
};

export type EstimateLineDto = {
  id: string;
  sectionId: string;
  lineType: EstimateItem["lineType"];
  productId: string | null;
  position: number;
  sku: string | null;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  unitLabel: string;
  sourcePrice: string | null;
  sourceCurrencyCode: string | null;
  sourceSnapshotAt: string | null;
  pricingMode: EstimatePricingMode;
  pricingInputValue: number | null;
  internalCostUnitPrice: number | null;
  convertedCostUnitPrice: number | null;
  exchangeRate: number | null;
  exchangeRateEffectiveDate: string | null;
  lineDiscountPercent: number;
  markupPercent: number | null;
  marginPercent: number | null;
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
  currencyRate: number | null;
  currencyRateEffectiveDate: string | null;
  validityDays: number;
  globalDiscountPercent: number;
  vatMode: EstimateVatMode;
  vatRatePercent: number;
  status: EstimateStatus;
  revision: number;
  updatedAt: string;
  total: string;
  totals: {
    subtotal: number;
    lineDiscountTotal: number;
    sectionDiscountTotal: number;
    globalDiscountAmount: number;
    chargesTotal: number;
    vatAmount: number;
    totalExcludingVat: number;
    finalTotal: number;
    grossProfit: number | null;
    overallMarginPercent: number | null;
  };
  hasIncompletePricing: boolean;
  itemCount: number;
  sections: Array<{ id: string; name: string; sortOrder: number; showSubtotal: boolean; discountPercent: number; subtotal: number; discountAmount: number; total: number }>;
  lines: EstimateLineDto[];
  charges: Array<{ id: string; chargeType: EstimateChargeType; description: string; amount: number; vatApplicable: boolean; customerVisible: boolean; sortOrder: number }>;
};

export type EstimateServiceDto = {
  id: string;
  name: string;
  description: string | null;
  defaultUnit: EstimateUnit;
  unitLabel: string;
  defaultCost: number | null;
  defaultSellingPrice: number | null;
  vatApplicable: boolean;
  category: string;
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

export type EstimateCommercialOptionsDto = {
  currencies: string[];
  usdMdlRate: number | null;
  rateEffectiveDate: string | null;
};

export type EstimateServiceSelection = {
  serviceId: string;
  quantity: number;
  sellingUnitPrice: number;
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

export type SaveEstimateCommercialCommand = {
  expectedRevision: number;
  name: string;
  customerName?: string | null;
  projectName?: string | null;
  validityDays: number;
  currencyCode: string;
  currencyChangePolicy: EstimateCurrencyChangePolicy;
  vatMode: EstimateVatMode;
  vatRatePercent: number;
  globalDiscountPercent: number;
  sections: Array<{ id: string; name: string; sortOrder: number; showSubtotal: boolean; discountPercent: number }>;
  lines: Array<{
    id: string;
    sectionId: string;
    position: number;
    description: string;
    quantity: number;
    unit: EstimateUnit;
    pricingMode: EstimatePricingMode;
    pricingInputValue: number | null;
    internalCostUnitPrice: number | null;
    lineDiscountPercent: number;
  }>;
  charges: Array<{ id: string; chargeType: EstimateChargeType; description: string; amount: number; vatApplicable: boolean; customerVisible: boolean; sortOrder: number }>;
};

export interface EstimateService {
  list(userId: string, filters: EstimateListFilters): Promise<{ records: EstimateSummaryDto[]; page: number; totalPages: number; totalCount: number }>;
  listAvailableCurrencies(userId: string): Promise<string[]>;
  getCommercialOptions(userId: string): Promise<EstimateCommercialOptionsDto>;
  listServices(userId: string): Promise<EstimateServiceDto[]>;
  searchProducts(userId: string, input: { search?: string; categoryId?: string; brandId?: string }): Promise<EstimateProductPickerDto>;
  createDraft(userId: string, input: CreateEstimateCommand): Promise<Estimate>;
  getDetail(userId: string, estimateId: string): Promise<EstimateDetailDto>;
  saveDraft(userId: string, estimateId: string, input: SaveEstimateCommand): Promise<EstimateDetailDto>;
  saveCommercialDraft(userId: string, estimateId: string, input: SaveEstimateCommercialCommand): Promise<EstimateDetailDto>;
  addProducts(userId: string, estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>): Promise<EstimateDetailDto>;
  addServices(userId: string, estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[]): Promise<EstimateDetailDto>;
  addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto>;
  addCustomLine(userId: string, estimateId: string, expectedRevision: number, description: string, unit: EstimateUnit, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto>;
  updateLine(userId: string, estimateId: string, itemId: string, expectedRevision: number, input: { description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<EstimateDetailDto>;
  removeLine(userId: string, estimateId: string, itemId: string, expectedRevision: number): Promise<EstimateDetailDto>;
  removeLines(userId: string, estimateId: string, itemIds: string[], expectedRevision: number): Promise<EstimateDetailDto>;
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

  async getCommercialOptions(userId: string): Promise<EstimateCommercialOptionsDto> {
    await this.resolveCompany(userId, PRICING_PERMISSION);
    const [currencies, rate] = await Promise.all([
      this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? Promise.resolve([]),
      this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? Promise.resolve(null),
    ]);
    return {
      currencies,
      usdMdlRate: rate?.mdlPerUsdRate ?? null,
      rateEffectiveDate: rate?.effectiveDate ?? null,
    };
  }

  async list(userId: string, filters: EstimateListFilters) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const page = normalizePage(filters.page);
    const result = await this.repository.list({
      companyId,
      search: normalizeOptional(filters.search, 100),
      status: normalizeStatus(filters.status),
      versionStatus: normalizeVersionFilter(filters.versionStatus),
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
        versionCount: record.versionCount,
        latestVersionStatus: record.latestVersionStatus,
        hasAcceptedVersion: record.hasAcceptedVersion,
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
      defaultCost: service.defaultCost,
      defaultSellingPrice: service.defaultSellingPrice,
      vatApplicable: service.vatApplicable,
      category: service.category,
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
    return toCommercialDetail(aggregate);
  }

  async saveCommercialDraft(userId: string, estimateId: string, input: SaveEstimateCommercialCommand): Promise<EstimateDetailDto> {
    const startedAt = performance.now();
    const companyId = await this.resolveCompany(userId, PRICING_PERMISSION);
    const aggregate = await this.repository.findAggregateById(normalizeId(estimateId));
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    if (aggregate.estimate.status !== "draft") throw new InvalidStateError("Only draft estimates can be changed.");
    if (aggregate.estimate.revision !== normalizeRevision(input.expectedRevision)) throw new InvalidStateError("Estimate was changed in another session. Reload before saving.");

    const normalized = await this.prepareCommercialSave(userId, aggregate, input);
    try {
      await this.repository.saveCommercialDraft(normalized);
    } catch (error) {
      handleRepositoryConflict(error);
    }
    const detail = await this.getDetail(userId, estimateId);
    const logContext = {
      estimateId,
      companyId,
      lineCount: input.lines.length,
      sectionCount: input.sections.length,
      currency: input.currencyCode,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    };
    console.info({ event: "estimate_commercial_settings_updated", ...logContext });
    if (aggregate.estimate.currencyCode !== input.currencyCode) console.info({ event: "estimate_currency_changed", ...logContext });
    if (input.sections.some((section) => !aggregate.sections.some((current) => current.id === section.id))) console.info({ event: "estimate_section_created", ...logContext });
    if (input.sections.some((section, index) => aggregate.sections.find((current) => current.id === section.id)?.sortOrder !== index)) console.info({ event: "estimate_section_reordered", ...logContext });
    if (input.lines.some((line, index) => { const current = aggregate.items.find((item) => item.id === line.id); return current?.sectionId !== line.sectionId || current.position !== index + 1; })) console.info({ event: "estimate_line_moved", ...logContext });
    if (aggregate.estimate.globalDiscountPercent !== input.globalDiscountPercent || input.lines.some((line) => aggregate.items.find((item) => item.id === line.id)?.lineDiscountPercent !== line.lineDiscountPercent) || input.sections.some((section) => aggregate.sections.find((current) => current.id === section.id)?.discountPercent !== section.discountPercent)) console.info({ event: "estimate_discount_changed", ...logContext });
    if (input.charges.some((charge) => !aggregate.charges.some((current) => current.id === charge.id))) console.info({ event: "estimate_charge_added", ...logContext });
    console.info({ event: "estimate_totals_recalculated", ...logContext });
    return detail;
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
    const needsConversion = commercialViews.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== estimate.currencyCode);
    const rateSnapshot = needsConversion ? await this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null;
    if (needsConversion && !rateSnapshot) throw new InvalidStateError("Для пересчета товарной цены нет опубликованного курса.");
    const lines: AddEstimateLineInput[] = products.map((product) => {
      const price = commercialByProduct.get(product.id)?.partnerPrice ?? null;
      const sameCurrency = price?.currencyCode === estimate.currencyCode;
      const exchangeRate = !price?.currencyCode ? null : sameCurrency ? 1 : resolveCurrencyRate(price.currencyCode, estimate.currencyCode, rateSnapshot!.mdlPerUsdRate);
      const convertedPrice = price && exchangeRate ? convertMoney(price.amount, exchangeRate) : null;
      return {
        lineType: "product",
        productId: product.id,
        serviceId: null,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        sourceUnitPrice: price?.amount ?? null,
        sourceCurrencyCode: price?.currencyCode ?? null,
        sourceSnapshotAt: price?.lastUpdatedAt ?? null,
        convertedCostUnitPrice: convertedPrice,
        exchangeRate,
        exchangeRateEffectiveDate: sameCurrency ? price?.lastUpdatedAt?.slice(0, 10) ?? null : rateSnapshot?.effectiveDate ?? null,
        description: product.name,
        quantity: quantityById.get(product.id) ?? 1,
        unit: "pcs",
        sellingUnitPrice: convertedPrice,
      };
    });
    await this.addLinesSafely(estimateId, expectedRevision, lines);
    return this.getDetail(userId, estimateId);
  }

  async addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number): Promise<EstimateDetailDto> {
    return this.addServices(userId, estimateId, expectedRevision, [{ serviceId, quantity, sellingUnitPrice }]);
  }

  async addServices(userId: string, estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[]): Promise<EstimateDetailDto> {
    const estimate = await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > MAX_PRODUCT_BATCH) {
      throw new InvalidStateError("Select between 1 and 50 services.");
    }
    const services = await this.repository.listServices(estimate.companyId);
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const selectionById = new Map<string, EstimateServiceSelection>();
    for (const selection of selections) {
      const serviceId = selection.serviceId.trim();
      if (serviceId) selectionById.set(serviceId, selection);
    }
    if (!selectionById.size) throw new InvalidStateError("Select at least one service.");
    const lines = [...selectionById].map(([serviceId, selection]): AddEstimateLineInput => {
      const service = serviceById.get(serviceId);
      if (!service) throw new NotFoundError("Service was not found.");
      return {
        lineType: "service",
        productId: null,
        serviceId: service.id,
        skuSnapshot: null,
        productNameSnapshot: null,
        sourceUnitPrice: null,
        sourceCurrencyCode: null,
        sourceSnapshotAt: null,
        internalCostUnitPrice: service.defaultCost,
        convertedCostUnitPrice: service.defaultCost,
        exchangeRate: service.defaultCost === null ? null : 1,
        exchangeRateEffectiveDate: null,
        description: service.name,
        quantity: normalizeQuantity(selection.quantity),
        unit: service.defaultUnit,
        sellingUnitPrice: normalizeMoney(selection.sellingUnitPrice),
      };
    });
    await this.addLinesSafely(estimateId, expectedRevision, lines);
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

  async removeLines(userId: string, estimateId: string, itemIds: string[], expectedRevision: number): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, MANAGE_PERMISSION, expectedRevision);
    const ids = [...new Set(itemIds.map((id) => normalizeId(id)))];
    if (!ids.length || ids.length > 100) throw new InvalidStateError("Select between 1 and 100 estimate lines.");
    try {
      await this.repository.removeLines(estimateId, ids, expectedRevision);
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

  private async prepareCommercialSave(userId: string, aggregate: EstimateAggregate, input: SaveEstimateCommercialCommand): Promise<SaveEstimateCommercialInput> {
    const metadata = normalizeMetadata(input);
    const currencies = await this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
    if (!currencies.includes(metadata.currencyCode)) throw new InvalidStateError("Выбранная валюта недоступна в опубликованных коммерческих данных.");
    const currencyChanged = metadata.currencyCode !== aggregate.estimate.currencyCode;
    let rateSnapshot: { mdlPerUsdRate: number; effectiveDate: string } | null = null;
    const needsProductConversion = aggregate.items.some((item) => item.lineType === "product" && item.sourceCurrencyCode && item.sourceCurrencyCode !== metadata.currencyCode && item.convertedCostUnitPrice === null);
    if (currencyChanged || needsProductConversion) {
      rateSnapshot = await this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null;
      if (!rateSnapshot) throw new InvalidStateError("Для пересчета сметы нет опубликованного курса.");
    }

    if (input.sections.length < 1 || input.sections.length > 100) throw new InvalidStateError("Смета должна содержать от 1 до 100 разделов.");
    const existingSectionIds = new Set(aggregate.sections.map((section) => section.id));
    const sectionIds = new Set<string>();
    const sections = input.sections.map((section, index) => {
      const id = normalizeUuid(section.id, "Раздел сметы некорректен.");
      if (sectionIds.has(id)) throw new InvalidStateError("Разделы сметы не должны повторяться.");
      sectionIds.add(id);
      return {
        id,
        name: normalizeRequired(section.name, 120, "Название раздела некорректно."),
        sortOrder: index,
        showSubtotal: section.showSubtotal,
        discountPercent: normalizePercentage(section.discountPercent, "Скидка раздела должна быть от 0 до 100%."),
      };
    });
    if ([...existingSectionIds].some((id) => !sectionIds.has(id))) throw new InvalidStateError("Удаление разделов пока не поддерживается.");

    if (input.lines.length !== aggregate.items.length || input.lines.length > 500) throw new InvalidStateError("Состав позиций сметы изменился. Обновите страницу.");
    const existingById = new Map(aggregate.items.map((item) => [item.id, item]));
    const submittedLineIds = new Set<string>();
    const oldToNewRate = currencyChanged ? resolveCurrencyRate(aggregate.estimate.currencyCode, metadata.currencyCode, rateSnapshot!.mdlPerUsdRate) : 1;
    const lines = input.lines.map((line, index) => {
      const id = normalizeUuid(line.id, "Позиция сметы некорректна.");
      const existing = existingById.get(id);
      if (!existing || submittedLineIds.has(id)) throw new InvalidStateError("Состав позиций сметы изменился. Обновите страницу.");
      submittedLineIds.add(id);
      const sectionId = normalizeUuid(line.sectionId, "Раздел позиции некорректен.");
      if (!sectionIds.has(sectionId)) throw new InvalidStateError("Раздел позиции не принадлежит смете.");
      const pricingMode = normalizePricingMode(line.pricingMode);
      let pricingInputValue = normalizeNullableMoneyInput(line.pricingInputValue, "Коммерческое значение позиции некорректно.");
      const internalCost = normalizeNullableMoneyInput(line.internalCostUnitPrice, "Себестоимость позиции некорректна.");
      let convertedCost: number | null = null;
      let exchangeRate: number | null = null;
      let exchangeRateEffectiveDate: string | null = null;

      if (existing.lineType === "product" && existing.sourceUnitPrice !== null && existing.sourceCurrencyCode) {
        if (!currencyChanged && existing.convertedCostUnitPrice !== null) {
          convertedCost = existing.convertedCostUnitPrice;
          exchangeRate = existing.exchangeRate;
          exchangeRateEffectiveDate = existing.exchangeRateEffectiveDate;
        } else {
          const publishedRate = rateSnapshot?.mdlPerUsdRate;
          if (existing.sourceCurrencyCode !== metadata.currencyCode && !publishedRate) {
            throw new InvalidStateError("Для пересчета товарной цены нет опубликованного курса.");
          }
          exchangeRate = existing.sourceCurrencyCode === metadata.currencyCode
            ? 1
            : resolveCurrencyRate(existing.sourceCurrencyCode, metadata.currencyCode, publishedRate!);
          convertedCost = convertMoney(existing.sourceUnitPrice, exchangeRate);
          exchangeRateEffectiveDate = exchangeRate === 1
            ? existing.sourceSnapshotAt?.slice(0, 10) ?? null
            : rateSnapshot!.effectiveDate;
        }
      } else if (internalCost !== null) {
        exchangeRate = oldToNewRate;
        convertedCost = currencyChanged ? convertMoney(internalCost, oldToNewRate) : internalCost;
        exchangeRateEffectiveDate = currencyChanged ? rateSnapshot!.effectiveDate : aggregate.estimate.currencyRateEffectiveDate;
      }

      if (currencyChanged && pricingMode === "direct" && pricingInputValue !== null) {
        const shouldConvert = existing.lineType === "product" || input.currencyChangePolicy === "convert_all";
        if (shouldConvert) pricingInputValue = convertMoney(pricingInputValue, oldToNewRate);
      }
      const normalizedLine = {
        id,
        sectionId,
        position: index + 1,
        description: normalizeDescription(line.description),
        quantity: normalizeQuantity(line.quantity),
        unit: normalizeUnit(line.unit),
        pricingMode,
        pricingInputValue,
        internalCostUnitPrice: internalCost,
        convertedCostUnitPrice: convertedCost,
        exchangeRate,
        exchangeRateEffectiveDate,
        lineDiscountPercent: normalizePercentage(line.lineDiscountPercent, "Скидка строки должна быть от 0 до 100%."),
      };
      calculateCommercialLine(normalizedLine);
      return normalizedLine;
    });

    const chargeIds = new Set<string>();
    const charges = input.charges.map((charge, index) => {
      const id = normalizeUuid(charge.id, "Начисление сметы некорректно.");
      if (chargeIds.has(id)) throw new InvalidStateError("Начисления не должны повторяться.");
      chargeIds.add(id);
      const amount = normalizeMoney(charge.amount);
      return {
        id,
        chargeType: normalizeChargeType(charge.chargeType),
        description: normalizeRequired(charge.description, 500, "Описание начисления некорректно."),
        amount: currencyChanged && input.currencyChangePolicy === "convert_all" ? convertMoney(amount, oldToNewRate) : amount,
        vatApplicable: charge.vatApplicable,
        customerVisible: charge.customerVisible,
        sortOrder: index,
      };
    });
    const globalDiscountPercent = normalizePercentage(input.globalDiscountPercent, "Глобальная скидка должна быть от 0 до 100%.");
    const vatRatePercent = normalizePercentage(input.vatRatePercent, "Ставка НДС должна быть от 0 до 100%.");
    const vatMode = normalizeVatMode(input.vatMode);
    calculateEstimateCommercials({ lines, sections, charges, globalDiscountPercent, vatMode, vatRatePercent });

    return {
      estimateId: aggregate.estimate.id,
      expectedRevision: input.expectedRevision,
      settings: {
        ...metadata,
        currencyRate: currencyChanged ? oldToNewRate : aggregate.estimate.currencyRate,
        currencyRateEffectiveDate: currencyChanged ? rateSnapshot!.effectiveDate : aggregate.estimate.currencyRateEffectiveDate,
        vatMode,
        vatRatePercent,
        globalDiscountPercent,
      },
      sections,
      lines,
      charges,
    };
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

function normalizeUuid(value: string, message: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    throw new InvalidStateError(message);
  }
  return normalized;
}

function normalizeNullableMoneyInput(value: number | null, message: string): number | null {
  if (value === null) return null;
  const decimal = decimalValue(value, message);
  if (decimal.lt(0) || decimal.gt("9999999999999999.99")) throw new InvalidStateError(message);
  return decimal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

function normalizePercentage(value: number, message: string): number {
  const decimal = decimalValue(value, message);
  if (decimal.lt(0) || decimal.gte(100)) throw new InvalidStateError(message);
  return decimal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

function normalizePricingMode(value: EstimatePricingMode): EstimatePricingMode {
  if (!( ["direct", "markup", "margin"] as const).includes(value)) throw new InvalidStateError("Режим цены некорректен.");
  return value;
}

function normalizeChargeType(value: EstimateChargeType): EstimateChargeType {
  if (!( ["delivery", "installation", "commissioning", "transport", "other"] as const).includes(value)) throw new InvalidStateError("Тип начисления некорректен.");
  return value;
}

function normalizeVatMode(value: EstimateVatMode): EstimateVatMode {
  if (!( ["included", "separate", "excluded", "none"] as const).includes(value)) throw new InvalidStateError("Режим НДС некорректен.");
  return value;
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

function normalizeVersionFilter(value: EstimateListFilters["versionStatus"]): EstimateListFilters["versionStatus"] {
  return value && (["prepared", "sent", "accepted", "rejected", "archived", "has_sent"] as const).includes(value) ? value : undefined;
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

function toCommercialDetail(aggregate: EstimateAggregate): EstimateDetailDto {
  const { estimate, items, sections, charges } = aggregate;
  const calculated = calculateEstimateCommercials({
    lines: items.map((item) => ({
      id: item.id,
      sectionId: item.sectionId,
      quantity: item.quantity,
      pricingMode: item.pricingMode,
      pricingInputValue: item.pricingInputValue,
      convertedCostUnitPrice: item.convertedCostUnitPrice,
      lineDiscountPercent: item.lineDiscountPercent,
    })),
    sections,
    charges,
    globalDiscountPercent: estimate.globalDiscountPercent,
    vatMode: estimate.vatMode,
    vatRatePercent: estimate.vatRatePercent,
  });
  const calculatedLineById = new Map(calculated.lines.map((line) => [line.id, line]));
  const calculatedSectionById = new Map(calculated.sectionTotals.map((section) => [section.id, section]));

  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    name: estimate.name,
    customerName: estimate.customerName,
    projectName: estimate.projectName,
    currencyCode: estimate.currencyCode,
    currencyRate: estimate.currencyRate,
    currencyRateEffectiveDate: estimate.currencyRateEffectiveDate,
    validityDays: estimate.validityDays,
    globalDiscountPercent: estimate.globalDiscountPercent,
    vatMode: estimate.vatMode,
    vatRatePercent: estimate.vatRatePercent,
    status: estimate.status,
    revision: estimate.revision,
    updatedAt: estimate.updatedAt,
    total: formatMoney(calculated.finalTotal, estimate.currencyCode),
    totals: {
      subtotal: calculated.subtotal,
      lineDiscountTotal: calculated.lineDiscountTotal,
      sectionDiscountTotal: calculated.sectionDiscountTotal,
      globalDiscountAmount: calculated.globalDiscountAmount,
      chargesTotal: calculated.chargesTotal,
      vatAmount: calculated.vatAmount,
      totalExcludingVat: calculated.totalExcludingVat,
      finalTotal: calculated.finalTotal,
      grossProfit: calculated.grossProfit,
      overallMarginPercent: calculated.overallMarginPercent,
    },
    hasIncompletePricing: calculated.incompletePricing,
    itemCount: items.length,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      sortOrder: section.sortOrder,
      showSubtotal: section.showSubtotal,
      discountPercent: section.discountPercent,
      subtotal: calculatedSectionById.get(section.id)?.subtotal ?? 0,
      discountAmount: calculatedSectionById.get(section.id)?.discountAmount ?? 0,
      total: calculatedSectionById.get(section.id)?.total ?? 0,
    })),
    lines: items.map((item) => {
      const line = calculatedLineById.get(item.id)!;
      return {
        id: item.id,
        sectionId: item.sectionId,
        lineType: item.lineType,
        productId: item.productId,
        position: item.position,
        sku: item.skuSnapshot,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitLabel: unitLabel(item.unit),
        sourcePrice: item.sourceUnitPrice === null || !item.sourceCurrencyCode ? null : formatMoney(item.sourceUnitPrice, item.sourceCurrencyCode),
        sourceCurrencyCode: item.sourceCurrencyCode,
        sourceSnapshotAt: item.sourceSnapshotAt,
        pricingMode: item.pricingMode,
        pricingInputValue: item.pricingInputValue,
        internalCostUnitPrice: item.internalCostUnitPrice,
        convertedCostUnitPrice: item.convertedCostUnitPrice,
        exchangeRate: item.exchangeRate,
        exchangeRateEffectiveDate: item.exchangeRateEffectiveDate,
        lineDiscountPercent: item.lineDiscountPercent,
        markupPercent: line.markupPercent,
        marginPercent: line.marginPercent,
        sellingUnitPrice: line.sellingUnitPrice,
        formattedSellingUnitPrice: line.sellingUnitPrice === null ? null : formatMoney(line.sellingUnitPrice, estimate.currencyCode),
        lineTotal: line.lineTotal === null ? null : formatMoney(line.lineTotal, estimate.currencyCode),
      };
    }),
    charges: charges.map(({ id, chargeType, description, amount, vatApplicable, customerVisible, sortOrder }) => ({ id, chargeType, description, amount, vatApplicable, customerVisible, sortOrder })),
  };
}

function legacyToDetail(estimate: Estimate, items: EstimateItem[]) {
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

void legacyToDetail;

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
