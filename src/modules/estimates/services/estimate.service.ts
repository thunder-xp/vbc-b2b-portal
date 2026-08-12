import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import {
  InvalidStateError,
  NotFoundError,
  resolveCommercialVisibility,
} from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import { evaluateFreshness } from "../../integration/freshness";
import type { AddEstimateLineInput, EstimateRepository, ExternalNomenclatureItemType, ExternalNomenclatureRecord, PartnerNomenclatureRecord, SaveEstimateCommercialInput } from "../repositories";
import { EstimateRepositoryError } from "../repositories";
import { isFinalCustomerIndustryCode, type Estimate, type EstimateAggregate, type EstimateChargeType, type EstimateCurrencyChangePolicy, type EstimateItem, type EstimateLifecycleStatus, type EstimatePricingMode, type EstimateStatus, type EstimateUnit, type EstimateVatMode, type FinalCustomerIndustryCode } from "../types";
import { calculateCommercialLine, calculateEstimateCommercials, convertMoney, resolveCurrencyRate } from "./commercial-calculation";
import { CANONICAL_ESTIMATE_SECTION_BY_KEY, canonicalSectionOrder } from "./estimate-sections";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const PRICING_PERMISSION = "estimates.pricing.manage";
const PAGE_SIZE = 20;
const MAX_PRODUCT_BATCH = 50;

export type EstimateListFilters = {
  search?: string;
  status?: EstimateStatus;
  lifecycleStatus?: EstimateLifecycleStatus;
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
  status: EstimateLifecycleStatus;
  archived: boolean;
  total: string;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  createdByName: string;
  itemCount: number;
  versionCount: number;
  latestVersionStatus: import("../types").EstimateVersionStatus | null;
  latestVersionId: string | null;
  latestPdfDocumentId: string | null;
  hasAcceptedVersion: boolean;
  canDeleteArchived: boolean;
};

export type EstimateLineDto = {
  id: string;
  sectionId: string;
  lineType: EstimateItem["lineType"];
  productId: string | null;
  externalNomenclatureId?: string | null;
  externalDemand?: import("../types").ExternalDemandState | null;
  imageUrl?: string | null;
  position: number;
  sku: string | null;
  description: string;
  quantity: number;
  unit: EstimateUnit;
  unitLabel: string;
  sourcePrice?: string | null;
  sourceCurrencyCode?: string | null;
  sourceSnapshotAt?: string | null;
  pricingMode: EstimatePricingMode;
  pricingInputValue: number | null;
  internalCostUnitPrice?: number | null;
  convertedCostUnitPrice?: number | null;
  exchangeRate?: number | null;
  exchangeRateEffectiveDate?: string | null;
  lineDiscountPercent: number;
  markupPercent?: number | null;
  marginPercent?: number | null;
  sellingUnitPrice: number | null;
  formattedSellingUnitPrice: string | null;
  lineTotal: string | null;
};

export type EstimateDetailDto = {
  id: string;
  estimateNumber: string;
  name: string;
  finalCustomerId?: string | null;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  currencyRate?: number | null;
  currencyRateEffectiveDate?: string | null;
  validityDays: number;
  globalDiscountPercent: number;
  vatMode: EstimateVatMode;
  vatRatePercent: number;
  status: EstimateStatus;
  lifecycleStatus?: EstimateLifecycleStatus;
  commercialMode?: "full" | "retail_only";
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
    grossProfit?: number | null;
    overallMarginPercent?: number | null;
  };
  hasIncompletePricing: boolean;
  itemCount: number;
  sections: Array<{ id: string; name: string; systemKey?: import("../types").EstimateSectionSystemKey | null; sortOrder: number; showSubtotal: boolean; discountPercent: number; subtotal: number; discountAmount: number; total: number }>;
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
    partnerPrice?: string | null;
    retailPrice: string | null;
    retailPriceAmount?: number | null;
    retailPriceCurrencyCode?: string | null;
    stock: string;
    expectedArrival: string | null;
  }>;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
};

export type FinalCustomerListFilters = {
  search?: string;
  industryCode?: string;
  page?: number;
};

export type EstimateCommercialCheckDto = {
  checkedAt: string;
  lines: Array<{
    lineId: string;
    sku: string | null;
    description: string;
    oldPrice: number | null;
    currentPrice: number | null;
    currencyCode: string;
    priceChanged: boolean;
    currentStock: string;
    currentArrival: string | null;
  }>;
};

export type EstimateCommercialOptionsDto = {
  currencies: string[];
  usdMdlRate: number | null;
  rateEffectiveDate: string | null;
  rateFreshness?: { label: string; staleNotice: string | null };
};

export type ExternalNomenclatureDto = ExternalNomenclatureRecord;
export type PartnerNomenclatureDto = PartnerNomenclatureRecord;

export type PartnerNomenclatureListFilters = {
  search?: string;
  itemType?: ExternalNomenclatureItemType;
  page?: number;
};

export type PartnerNomenclatureInput = {
  itemType: ExternalNomenclatureItemType;
  manufacturer?: string | null;
  model?: string | null;
  name: string;
  category?: string | null;
  unit: EstimateUnit;
  specification?: string | null;
  forceCreateNew?: boolean;
  requestKey: string;
};

export type EstimateServiceSelection = {
  serviceId: string;
  quantity: number;
  sellingUnitPrice: number;
};

export type CreateEstimateCommand = {
  name: string;
  finalCustomerId?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
  requestKey?: string;
};

export type CreateEstimateWithProductCommand = CreateEstimateCommand & {
  productId: string;
  quantity: number;
  lineRequestKey: string;
};

export type EstimateLineInsertion = {
  targetSectionId: string;
  requestKey: string;
};

export type EstimateSectionInsertion = {
  name: string;
  requestKey: string;
};

export type ExternalNomenclatureInput = {
  targetSectionId: string;
  existingExternalItemId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  name: string;
  category?: string | null;
  unit: EstimateUnit;
  specification?: string | null;
  quantity: number;
  sellingUnitPrice: number;
  forceCreateNew: boolean;
  requestKey: string;
};

export type SaveEstimateCommand = Omit<CreateEstimateCommand, "currencyCode" | "requestKey"> & {
  expectedRevision: number;
};

export type SaveEstimateCommercialCommand = {
  expectedRevision: number;
  name: string;
  finalCustomerId?: string | null;
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
  searchProducts(userId: string, input: { search?: string; categoryId?: string; brandId?: string; includeFacets?: boolean }): Promise<EstimateProductPickerDto>;
  searchExternalNomenclature(userId: string, query: string, itemType: ExternalNomenclatureItemType, scope: "own" | "shared"): Promise<ExternalNomenclatureRecord[]>;
  listPartnerNomenclature(userId: string, filters: PartnerNomenclatureListFilters): Promise<{ records: PartnerNomenclatureRecord[]; page: number; totalPages: number; totalCount: number }>;
  createPartnerNomenclature(userId: string, input: PartnerNomenclatureInput): Promise<string>;
  updatePartnerNomenclature(userId: string, itemId: string, expectedVersion: number, input: Omit<PartnerNomenclatureInput, "itemType" | "manufacturer" | "model" | "forceCreateNew" | "requestKey">): Promise<number>;
  archivePartnerNomenclature(userId: string, itemId: string, expectedVersion: number): Promise<void>;
  getPartnerNomenclatureMutationContext(userId: string): Promise<{ companyId: string }>;
  adoptPartnerNomenclature(userId: string, itemId: string): Promise<void>;
  searchFinalCustomers(userId: string, query: string): Promise<import("../types").FinalCustomer[]>;
  listFinalCustomers(userId: string, filters: FinalCustomerListFilters): Promise<{ records: import("../types").FinalCustomerListRecord[]; page: number; totalPages: number; totalCount: number }>;
  getFinalCustomerDetail(userId: string, customerId: string): Promise<import("../types").FinalCustomerDetail>;
  createFinalCustomer(userId: string, input: {
    displayName: string;
    customerType: import("../types").FinalCustomerType;
    fiscalCode?: string | null;
    locality?: string | null;
    industryCode?: FinalCustomerIndustryCode | null;
  }): Promise<import("../types").FinalCustomer>;
  updateFinalCustomer(userId: string, customerId: string, expectedRevision: number, input: {
    displayName: string;
    customerType: import("../types").FinalCustomerType;
    fiscalCode?: string | null;
    locality?: string | null;
    industryCode?: FinalCustomerIndustryCode | null;
  }): Promise<import("../types").FinalCustomer>;
  checkCurrentProductState(userId: string, estimateId: string): Promise<EstimateCommercialCheckDto>;
  createDraft(userId: string, input: CreateEstimateCommand): Promise<Estimate>;
  createDraftWithProduct(userId: string, input: CreateEstimateWithProductCommand): Promise<{ estimateId: string; repeated: boolean }>;
  createFromPurchasingList(userId: string, input: { listId: string; name: string; requestKey: string; items: Array<{ itemId: string; productId: string; quantity: number }> }): Promise<{ estimateId: string; repeated: boolean; added: number; skipped: number }>;
  getDetail(userId: string, estimateId: string): Promise<EstimateDetailDto>;
  saveDraft(userId: string, estimateId: string, input: SaveEstimateCommand): Promise<EstimateDetailDto>;
  saveCommercialDraft(userId: string, estimateId: string, input: SaveEstimateCommercialCommand): Promise<EstimateDetailDto>;
  addSection(userId: string, estimateId: string, expectedRevision: number, insertion: EstimateSectionInsertion): Promise<EstimateDetailDto>;
  addProducts(userId: string, estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>, insertion: EstimateLineInsertion): Promise<EstimateDetailDto>;
  addServices(userId: string, estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[], insertion: EstimateLineInsertion): Promise<EstimateDetailDto>;
  addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number, insertion: EstimateLineInsertion): Promise<EstimateDetailDto>;
  addCustomLine(userId: string, estimateId: string, expectedRevision: number, description: string, unit: EstimateUnit, quantity: number, sellingUnitPrice: number, insertion: EstimateLineInsertion): Promise<EstimateDetailDto>;
  addExternalLine(userId: string, estimateId: string, expectedRevision: number, input: ExternalNomenclatureInput): Promise<EstimateDetailDto>;
  updateLine(userId: string, estimateId: string, itemId: string, expectedRevision: number, input: { description: string; unit: EstimateUnit; quantity: number; sellingUnitPrice: number }): Promise<EstimateDetailDto>;
  removeLine(userId: string, estimateId: string, itemId: string, expectedRevision: number): Promise<EstimateDetailDto>;
  removeLines(userId: string, estimateId: string, itemIds: string[], expectedRevision: number): Promise<EstimateDetailDto>;
  archive(userId: string, estimateId: string, expectedRevision: number): Promise<void>;
  deleteArchived(userId: string, estimateId: string, expectedRevision: number, requestKey: string): Promise<void>;
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
    const companyId = await this.resolveCompany(userId, PRICING_PERMISSION);
    const canViewPartnerPrice = await this.canViewPartnerPrice(userId, companyId);
    const [currencies, rate] = await Promise.all([
      this.listAvailableCurrencies(userId),
      this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? Promise.resolve(null),
    ]);
    return {
      currencies,
      usdMdlRate: canViewPartnerPrice ? rate?.mdlPerUsdRate ?? null : null,
      rateEffectiveDate: canViewPartnerPrice ? rate?.effectiveDate ?? null : null,
      rateFreshness: canViewPartnerPrice
        ? evaluateFreshness(rate?.effectiveDate ?? null, "price", "Коммерческий курс")
        : undefined,
    };
  }

  async list(userId: string, filters: EstimateListFilters) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const page = normalizePage(filters.page);
    const result = await this.repository.list({
      companyId,
      search: normalizeOptional(filters.search, 100),
      status: normalizeStatus(filters.status),
      lifecycleStatus: normalizeLifecycleStatus(filters.lifecycleStatus),
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
        status: record.lifecycleStatus ?? "draft",
        archived: record.status === "archived",
        total: formatMoney(record.totalAmount, record.currencyCode),
        currencyCode: record.currencyCode,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        revision: record.revision,
        createdByName: record.createdByName,
        itemCount: record.itemCount,
        versionCount: record.versionCount,
        latestVersionStatus: record.latestVersionStatus,
        latestVersionId: record.latestVersionId,
        latestPdfDocumentId: record.latestPdfDocumentId,
        hasAcceptedVersion: record.hasAcceptedVersion,
        canDeleteArchived: record.canDeleteArchived,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
      totalCount: result.totalCount,
    };
  }

  async listAvailableCurrencies(userId: string): Promise<string[]> {
    await this.resolveCompany(userId, VIEW_PERMISSION);
    const published = await this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
    return [...new Set(published)].filter((value) => /^[A-Z]{3}$/.test(value)).sort((left, right) => left === "USD" ? -1 : right === "USD" ? 1 : left.localeCompare(right));
  }

  async searchExternalNomenclature(userId: string, query: string, itemType: ExternalNomenclatureItemType, scope: "own" | "shared"): Promise<ExternalNomenclatureRecord[]> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const normalized = normalizeRequired(query, 300, "Введите производителя, модель или название.");
    if (normalized.length < 2) return [];
    if (!this.repository.searchExternalNomenclature) throw new InvalidStateError("Библиотека внешних позиций временно недоступна.");
    return this.repository.searchExternalNomenclature(companyId, normalized, normalizeExternalItemType(itemType), scope === "shared" ? "shared" : "own", 8);
  }

  async listPartnerNomenclature(userId: string, filters: PartnerNomenclatureListFilters) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    if (!this.repository.listPartnerNomenclature) throw new InvalidStateError("Библиотека номенклатуры временно недоступна.");
    const page = normalizePage(filters.page);
    const result = await this.repository.listPartnerNomenclature({
      companyId,
      search: normalizeOptional(filters.search, 100),
      itemType: filters.itemType ? normalizeExternalItemType(filters.itemType) : undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return {
      records: result.records,
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
      totalCount: result.totalCount,
    };
  }

  async createPartnerNomenclature(userId: string, input: PartnerNomenclatureInput): Promise<string> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!this.repository.createPartnerNomenclature) throw new InvalidStateError("Создание номенклатуры временно недоступно.");
    const itemType = normalizeExternalItemType(input.itemType);
    const normalized = normalizePartnerNomenclatureInput(input, itemType);
    const requestKey = normalizeUuid(input.requestKey, "Ключ создания номенклатуры некорректен.");
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ itemType, ...normalized })).digest("hex");
    try {
      return await this.repository.createPartnerNomenclature({
        companyId,
        requestKey,
        requestFingerprint,
        itemType,
        ...normalized,
        forceCreateNew: input.forceCreateNew === true,
      });
    } catch (error) {
      if (error instanceof EstimateRepositoryError && error.code === "duplicate") {
        throw new InvalidStateError("Похожая позиция уже есть в общей библиотеке. Расширьте поиск и выберите существующую либо подтвердите создание новой.");
      }
      handleRepositoryConflict(error);
    }
  }

  async updatePartnerNomenclature(userId: string, itemId: string, expectedVersion: number, input: Omit<PartnerNomenclatureInput, "itemType" | "manufacturer" | "model" | "forceCreateNew" | "requestKey">): Promise<number> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!this.repository.updatePartnerNomenclature) throw new InvalidStateError("Изменение номенклатуры временно недоступно.");
    try {
      return await this.repository.updatePartnerNomenclature({
        companyId,
        itemId: normalizeUuid(itemId, "Позиция номенклатуры некорректна."),
        expectedVersion: normalizeNonnegativeVersion(expectedVersion),
        name: normalizeRequired(input.name, 300, "Укажите название позиции."),
        category: normalizeOptional(input.category ?? undefined, 160) ?? null,
        unit: normalizeUnit(input.unit),
        specification: normalizeOptional(input.specification ?? undefined, 2000) ?? null,
      });
    } catch (error) {
      handleRepositoryConflict(error);
    }
  }

  async archivePartnerNomenclature(userId: string, itemId: string, expectedVersion: number): Promise<void> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!this.repository.archivePartnerNomenclature) throw new InvalidStateError("Архивация номенклатуры временно недоступна.");
    try {
      await this.repository.archivePartnerNomenclature(companyId, normalizeUuid(itemId, "Позиция номенклатуры некорректна."), normalizeNonnegativeVersion(expectedVersion));
    } catch (error) {
      handleRepositoryConflict(error);
    }
  }

  async getPartnerNomenclatureMutationContext(userId: string): Promise<{ companyId: string }> {
    return { companyId: await this.resolveCompany(userId, MANAGE_PERMISSION) };
  }

  async adoptPartnerNomenclature(userId: string, itemId: string): Promise<void> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!this.repository.adoptPartnerNomenclature) throw new InvalidStateError("Общая номенклатура временно недоступна.");
    await this.repository.adoptPartnerNomenclature(companyId, normalizeUuid(itemId, "Позиция номенклатуры некорректна."));
  }

  async searchFinalCustomers(userId: string, query: string) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const normalized = normalizeOptional(query, 100);
    if (!normalized || normalized.length < 2) return [];
    if (!this.repository.searchFinalCustomers) throw new InvalidStateError("Поиск заказчиков временно недоступен.");
    return this.repository.searchFinalCustomers(companyId, normalized, 8);
  }

  async listFinalCustomers(userId: string, filters: FinalCustomerListFilters) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    if (!this.repository.listFinalCustomers) throw new InvalidStateError("Список заказчиков временно недоступен.");
    const page = normalizePage(filters.page);
    const industryCode = filters.industryCode && isFinalCustomerIndustryCode(filters.industryCode) ? filters.industryCode : undefined;
    const result = await this.repository.listFinalCustomers({
      companyId,
      search: normalizeOptional(filters.search, 100),
      industryCode,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    return { ...result, page, totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)) };
  }

  async getFinalCustomerDetail(userId: string, customerId: string) {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    if (!this.repository.getFinalCustomerDetail) throw new InvalidStateError("Заказчик временно недоступен.");
    const customer = await this.repository.getFinalCustomerDetail(companyId, normalizeUuid(customerId, "Заказчик некорректен."), 50);
    if (!customer) throw new NotFoundError("Заказчик не найден.");
    return customer;
  }

  async createFinalCustomer(userId: string, input: {
    displayName: string;
    customerType: import("../types").FinalCustomerType;
    fiscalCode?: string | null;
    locality?: string | null;
    industryCode?: FinalCustomerIndustryCode | null;
  }) {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!(["company", "individual"] as const).includes(input.customerType)) throw new InvalidStateError("Тип заказчика некорректен.");
    if (!this.repository.createFinalCustomer) throw new InvalidStateError("Создание заказчика временно недоступно.");
    try {
      return await this.repository.createFinalCustomer({
        companyId,
        displayName: normalizeRequired(input.displayName, 200, "Укажите заказчика."),
        customerType: input.customerType,
        fiscalCode: normalizeOptional(input.fiscalCode ?? undefined, 32) ?? null,
        locality: normalizeOptional(input.locality ?? undefined, 120) ?? null,
        industryCode: normalizeIndustryCode(input.industryCode),
      });
    } catch (error) {
      if (error instanceof EstimateRepositoryError && error.code === "duplicate") {
        throw new InvalidStateError("Похожий заказчик уже существует. Найдите и выберите его из списка.");
      }
      throw error;
    }
  }

  async updateFinalCustomer(userId: string, customerId: string, expectedRevision: number, input: {
    displayName: string;
    customerType: import("../types").FinalCustomerType;
    fiscalCode?: string | null;
    locality?: string | null;
    industryCode?: FinalCustomerIndustryCode | null;
  }) {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    if (!this.repository.updateFinalCustomer) throw new InvalidStateError("Изменение заказчика временно недоступно.");
    try {
      return await this.repository.updateFinalCustomer({
        companyId,
        customerId: normalizeUuid(customerId, "Заказчик некорректен."),
        expectedRevision: normalizeRevision(expectedRevision),
        displayName: normalizeRequired(input.displayName, 200, "Укажите заказчика."),
        customerType: input.customerType,
        fiscalCode: normalizeOptional(input.fiscalCode ?? undefined, 32) ?? null,
        locality: normalizeOptional(input.locality ?? undefined, 120) ?? null,
        industryCode: normalizeIndustryCode(input.industryCode),
      });
    } catch (error) {
      if (error instanceof EstimateRepositoryError && error.code === "duplicate") {
        throw new InvalidStateError("Похожий заказчик уже существует. Используйте существующую запись.");
      }
      throw error;
    }
  }

  async listServices(userId: string): Promise<EstimateServiceDto[]> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const canViewPartnerPrice = await this.canViewPartnerPrice(userId, companyId);
    return (await this.repository.listServices(companyId)).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      defaultUnit: service.defaultUnit,
      unitLabel: unitLabel(service.defaultUnit),
      defaultCost: canViewPartnerPrice ? service.defaultCost : null,
      defaultSellingPrice: service.defaultSellingPrice,
      vatApplicable: service.vatApplicable,
      category: service.category,
    }));
  }

  async searchProducts(userId: string, input: { search?: string; categoryId?: string; brandId?: string; includeFacets?: boolean }): Promise<EstimateProductPickerDto> {
    const startedAt = performance.now();
    await this.resolveCompany(userId, VIEW_PERMISSION);
    const contextResolvedAt = performance.now();
    const includeFacets = input.includeFacets !== false;
    const [result, categories, brands] = await Promise.all([
      this.catalogService.listProducts(userId, {
        search: normalizeOptional(input.search, 100),
        categoryId: normalizeOptional(input.categoryId, 50),
        brandId: normalizeOptional(input.brandId, 50),
        page: 1,
        pageSize: 12,
      }),
      includeFacets ? this.catalogService.listCategories(userId) : Promise.resolve([]),
      includeFacets ? this.catalogService.listBrands(userId) : Promise.resolve([]),
    ]);
    const catalogResolvedAt = performance.now();
    const commercial = result.commercialViews ?? await this.pricingInventoryService.getProductCommercialViews(
      userId,
      result.products.map((product) => product.id),
    );
    const commercialResolvedAt = performance.now();
    const commercialByProduct = new Map(commercial.map((view) => [view.productId, view]));
    const dto: EstimateProductPickerDto = {
      products: result.products.map((product) => {
        const view = commercialByProduct.get(product.id);
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          categoryName: product.category?.name ?? null,
          brandName: product.brand?.name ?? null,
          ...(view?.partnerPrice
            ? { partnerPrice: view.partnerPrice.formattedAmount }
            : {}),
          retailPrice: view?.retailPrice?.formattedAmount ?? null,
          retailPriceAmount: view?.retailPrice?.amount ?? null,
          retailPriceCurrencyCode: view?.retailPrice?.currencyCode ?? null,
          stock: view?.stock?.label ?? "Наличие уточняется",
          expectedArrival: view?.stock?.expectedArrival?.formattedExpectedDate ?? null,
        };
      }),
      categories: categories.map(({ id, name }) => ({ id, name })),
      brands: brands.map(({ id, name }) => ({ id, name })),
    };
    console.info({
      event: "estimate_product_search_performance",
      includeFacets,
      resultCount: dto.products.length,
      stageMs: {
        context: Math.round(contextResolvedAt - startedAt),
        catalogAndFacets: Math.round(catalogResolvedAt - contextResolvedAt),
        commercialFallback: Math.round(commercialResolvedAt - catalogResolvedAt),
        projection: Math.round(performance.now() - commercialResolvedAt),
      },
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
    return dto;
  }

  async checkCurrentProductState(userId: string, estimateId: string): Promise<EstimateCommercialCheckDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const aggregate = await this.repository.findAggregateById(normalizeId(estimateId));
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    const productLines = aggregate.items.filter((item) => item.lineType === "product" && item.productId);
    const productIds = [...new Set(productLines.map((item) => item.productId!))];
    const views = productIds.length
      ? await this.pricingInventoryService.getProductCommercialViews(userId, productIds)
      : [];
    const viewByProduct = new Map(views.map((view) => [view.productId, view]));
    const needsRate = views.some((view) => {
      const price = view.retailPrice;
      return price?.currencyCode && price.currencyCode !== aggregate.estimate.currencyCode;
    });
    const rate = needsRate
      ? await this.pricingInventoryService.getRetailUsdMdlRateSnapshot?.(userId) ?? null
      : null;

    return {
      checkedAt: new Date().toISOString(),
      lines: productLines.map((line) => {
        const view = viewByProduct.get(line.productId!);
        const price = view?.retailPrice;
        const exchangeRate = price?.currencyCode === aggregate.estimate.currencyCode
          ? 1
          : price?.currencyCode && rate
            ? resolveCurrencyRate(price.currencyCode, aggregate.estimate.currencyCode, rate.mdlPerUsdRate)
            : null;
        const currentPrice = price && exchangeRate ? convertMoney(price.amount, exchangeRate) : null;
        return {
          lineId: line.id,
          sku: line.skuSnapshot,
          description: line.description,
          oldPrice: line.sellingUnitPrice,
          currentPrice,
          currencyCode: aggregate.estimate.currencyCode,
          priceChanged: !sameMoney(line.sellingUnitPrice, currentPrice),
          currentStock: view?.stock?.label ?? "Наличие уточняется",
          currentArrival: view?.stock?.expectedArrival?.formattedExpectedDate ?? null,
        };
      }),
    };
  }

  async createDraft(userId: string, input: CreateEstimateCommand): Promise<Estimate> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const currencies = await this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
    const normalized = normalizeMetadata(input);
    const finalCustomerId = input.finalCustomerId ? normalizeUuid(input.finalCustomerId, "Выберите заказчика.") : null;
    if (!finalCustomerId) throw new InvalidStateError("Выберите или создайте заказчика.");
    if (!currencies.includes(normalized.currencyCode)) {
      throw new InvalidStateError("Estimate currency is not available in published commercial data.");
    }
    return this.repository.create({ companyId, ...normalized, finalCustomerId, requestKey: normalizeUuid(input.requestKey ?? randomUUID(), "Ключ создания сметы некорректен.") });
  }

  async createFromPurchasingList(userId: string, input: { listId: string; name: string; requestKey: string; items: Array<{ itemId: string; productId: string; quantity: number }> }) {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    await this.resolveCompany(userId, PRICING_PERMISSION);
    const normalizedItems = input.items.map((item) => ({ itemId: normalizeId(item.itemId), productId: normalizeId(item.productId), quantity: normalizeQuantity(item.quantity) }));
    if (!normalizedItems.length || normalizedItems.length > MAX_PRODUCT_BATCH || new Set(normalizedItems.map((item) => item.itemId)).size !== normalizedItems.length) {
      throw new InvalidStateError("Select between 1 and 50 products.");
    }
    const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
    const [products, commercialViews] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercialViews.map((view) => [view.productId, view]));
    const priced = normalizedItems.flatMap((item) => {
      const product = productById.get(item.productId);
      const commercial = commercialById.get(item.productId);
      const retailPrice = commercial?.retailPrice;
      const partnerPrice = commercial?.partnerPrice;
      return product && retailPrice?.currencyCode && retailPrice.amount >= 0 && partnerPrice?.currencyCode && partnerPrice.amount >= 0
        ? [{ item, product, retailPrice, partnerPrice }]
        : [];
    });
    if (!priced.length) throw new InvalidStateError("No products with current RETAIL and partner prices were selected.");
    const currencyCode = priced[0].retailPrice.currencyCode!;
    const retailNeedsConversion = priced.some(({ retailPrice }) => retailPrice.currencyCode !== currencyCode);
    const costNeedsConversion = priced.some(({ partnerPrice }) => partnerPrice.currencyCode !== currencyCode);
    const [retailRate, costRate] = await Promise.all([
      retailNeedsConversion ? this.pricingInventoryService.getRetailUsdMdlRateSnapshot?.(userId) ?? null : null,
      costNeedsConversion ? this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null,
    ]);
    if (retailNeedsConversion && !retailRate) throw new InvalidStateError("No published RETAIL rate is available for estimate conversion.");
    if (costNeedsConversion && !costRate) throw new InvalidStateError("No published partner rate is available for estimate conversion.");
    const lines = priced.map(({ item, product, retailPrice, partnerPrice }) => {
      const retailExchangeRate = retailPrice.currencyCode === currencyCode ? 1 : resolveCurrencyRate(retailPrice.currencyCode!, currencyCode, retailRate!.mdlPerUsdRate);
      const costExchangeRate = partnerPrice.currencyCode === currencyCode ? 1 : resolveCurrencyRate(partnerPrice.currencyCode!, currencyCode, costRate!.mdlPerUsdRate);
      return {
        itemId: item.itemId,
        productId: product.id,
        quantity: item.quantity,
        sku: product.sku,
        productName: product.name,
        sourceUnitPrice: partnerPrice.amount,
        sourceCurrencyCode: partnerPrice.currencyCode!,
        sourceSnapshotAt: partnerPrice.lastUpdatedAt ?? null,
        sellingUnitPrice: convertMoney(retailPrice.amount, retailExchangeRate),
        convertedCostUnitPrice: convertMoney(partnerPrice.amount, costExchangeRate),
        exchangeRate: costExchangeRate,
        exchangeRateEffectiveDate: costExchangeRate === 1 ? partnerPrice.lastUpdatedAt?.slice(0, 10) ?? null : costRate?.effectiveDate ?? null,
      };
    });
    const requestFingerprint = createHash("sha256").update(`${input.listId}|${lines.slice().sort((a, b) => a.itemId.localeCompare(b.itemId)).map((line) => `${line.itemId}:${line.quantity}`).join("|")}`).digest("hex");
    const result = await this.repository.createFromPurchasingList({ listId: normalizeId(input.listId), requestKey: normalizeId(input.requestKey), requestFingerprint, name: normalizeRequired(input.name, 200, "Укажите название сметы."), currencyCode, items: lines, summary: { added: lines.length, skipped: normalizedItems.length - lines.length } });
    return { ...result, added: lines.length, skipped: normalizedItems.length - lines.length };
  }

  async getDetail(userId: string, estimateId: string): Promise<EstimateDetailDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const [aggregate, canViewPartnerPrice] = await Promise.all([
      this.repository.findAggregateById(normalizeId(estimateId)),
      this.canViewPartnerPrice(userId, companyId),
    ]);
    return this.projectDetailForCompany(userId, aggregate, companyId, canViewPartnerPrice);
  }

  async createDraftWithProduct(userId: string, input: CreateEstimateWithProductCommand): Promise<{ estimateId: string; repeated: boolean }> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, PRICING_PERMISSION);
    const normalized = normalizeMetadata(input);
    const finalCustomerId = input.finalCustomerId ? normalizeUuid(input.finalCustomerId, "Выберите заказчика.") : null;
    if (!finalCustomerId) throw new InvalidStateError("Выберите или создайте заказчика.");
    const currencies = await this.pricingInventoryService.listAvailableCurrencyCodes?.(userId) ?? [];
    if (!currencies.includes(normalized.currencyCode)) throw new InvalidStateError("Estimate currency is not available in published commercial data.");
    const lines = await this.buildProductLines(userId, { companyId, currencyCode: normalized.currencyCode }, [{ productId: input.productId, quantity: input.quantity }]);
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ companyId, finalCustomerId, ...normalized, lines })).digest("hex");
    return this.repository.createWithProduct({
      companyId,
      ...normalized,
      finalCustomerId,
      requestKey: normalizeUuid(input.requestKey ?? randomUUID(), "Ключ создания сметы некорректен."),
      lineRequestKey: normalizeUuid(input.lineRequestKey, "Ключ добавления товара некорректен."),
      requestFingerprint,
      lines,
    });
  }

  private async getDetailForCompany(userId: string, estimateId: string, companyId: string, canViewPartnerPrice: boolean): Promise<EstimateDetailDto> {
    const aggregate = await this.repository.findAggregateById(normalizeId(estimateId));
    return this.projectDetailForCompany(userId, aggregate, companyId, canViewPartnerPrice);
  }

  private async projectDetailForCompany(userId: string, aggregate: EstimateAggregate | null, companyId: string, canViewPartnerPrice: boolean): Promise<EstimateDetailDto> {
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    const productIds = [...new Set(aggregate.items.flatMap((item) => item.productId ? [item.productId] : []))];
    const images = new Map<string, string | null>();
    if (productIds.length && this.catalogService.getProductReferencesByIds) {
      const products = await this.catalogService.getProductReferencesByIds(userId, productIds);
      products.forEach((product) => images.set(product.productId, product.thumbnail));
    } else if (productIds.length) {
      const products = await this.catalogService.getProductsByIds(userId, productIds);
      products.forEach((product) => images.set(product.id, product.imageUrl));
    }
    return projectEstimateDetail(
      toCommercialDetail(aggregate, images),
      canViewPartnerPrice,
    );
  }

  async saveCommercialDraft(userId: string, estimateId: string, input: SaveEstimateCommercialCommand): Promise<EstimateDetailDto> {
    const startedAt = performance.now();
    const companyId = await this.resolveCompany(userId, PRICING_PERMISSION);
    const contextResolvedAt = performance.now();
    const [aggregate, canViewPartnerPrice] = await Promise.all([
      this.repository.findAggregateById(normalizeId(estimateId)),
      this.canViewPartnerPrice(userId, companyId),
    ]);
    const aggregateResolvedAt = performance.now();
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    if (aggregate.estimate.status !== "draft") throw new InvalidStateError("Only draft estimates can be changed.");
    if (aggregate.estimate.revision !== normalizeRevision(input.expectedRevision)) throw new InvalidStateError("Estimate was changed in another session. Reload before saving.");

    if (!canViewPartnerPrice && input.currencyCode !== aggregate.estimate.currencyCode) {
      throw new InvalidStateError(
        "Изменение валюты требует полного коммерческого доступа.",
      );
    }
    const safeInput = canViewPartnerPrice
      ? input
      : preserveConfidentialEstimateInputs(aggregate, input);
    const normalized = await this.prepareCommercialSave(userId, aggregate, safeInput);
    const preparedAt = performance.now();
    try {
      await this.repository.saveCommercialDraft(normalized);
    } catch (error) {
      handleRepositoryConflict(error);
    }
    const savedAt = performance.now();
    // Reuse the already verified tenant/access context after the mutation. Re-resolving
    // it here previously allowed a successful commit to be reported as a failed Save.
    const detail = await this.getDetailForCompany(userId, estimateId, companyId, canViewPartnerPrice);
    const logContext = {
      estimateId,
      companyId,
      lineCount: input.lines.length,
      sectionCount: input.sections.length,
      currency: input.currencyCode,
      durationMs: Math.round(performance.now() - startedAt),
      stageMs: {
        context: Math.round(contextResolvedAt - startedAt),
        aggregateAndVisibility: Math.round(aggregateResolvedAt - contextResolvedAt),
        validationAndCommercials: Math.round(preparedAt - aggregateResolvedAt),
        saveRpc: Math.round(savedAt - preparedAt),
        responseProjection: Math.round(performance.now() - savedAt),
      },
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
        finalCustomerId: input.finalCustomerId ? normalizeUuid(input.finalCustomerId, "Выберите заказчика.") : null,
        customerName: normalized.customerName,
        projectName: normalized.projectName,
        validityDays: normalized.validityDays,
      });
    } catch (error) {
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  async addProducts(userId: string, estimateId: string, expectedRevision: number, selections: Array<{ productId: string; quantity: number }>, insertion: EstimateLineInsertion): Promise<EstimateDetailDto> {
    const estimate = await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    const lines = await this.buildProductLines(userId, estimate, selections);
    await this.addLinesSafely(estimateId, expectedRevision, lines, insertion);
    return this.getDetail(userId, estimateId);
  }

  private async buildProductLines(userId: string, estimate: Pick<Estimate, "companyId" | "currencyCode">, selections: Array<{ productId: string; quantity: number }>): Promise<AddEstimateLineInput[]> {
    const canViewPartnerPrice = await this.canViewPartnerPrice(
      userId,
      estimate.companyId,
    );
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
    const retailNeedsConversion = commercialViews.some((view) => view.retailPrice?.currencyCode && view.retailPrice.currencyCode !== estimate.currencyCode);
    const costNeedsConversion = canViewPartnerPrice && commercialViews.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== estimate.currencyCode);
    const [retailRateSnapshot, costRateSnapshot] = await Promise.all([
      retailNeedsConversion ? this.pricingInventoryService.getRetailUsdMdlRateSnapshot?.(userId) ?? null : null,
      costNeedsConversion ? this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null,
    ]);
    if (retailNeedsConversion && !retailRateSnapshot) throw new InvalidStateError("Для пересчета розничной цены нет опубликованного курса.");
    if (costNeedsConversion && !costRateSnapshot) throw new InvalidStateError("Для пересчета закупочной цены нет опубликованного курса.");
    const lines: AddEstimateLineInput[] = products.map((product) => {
      const view = commercialByProduct.get(product.id);
      const retailPrice = view?.retailPrice ?? null;
      const costPrice = canViewPartnerPrice ? view?.partnerPrice ?? null : null;
      const retailSameCurrency = retailPrice?.currencyCode === estimate.currencyCode;
      const retailExchangeRate = !retailPrice?.currencyCode ? null : retailSameCurrency ? 1 : resolveCurrencyRate(retailPrice.currencyCode, estimate.currencyCode, retailRateSnapshot!.mdlPerUsdRate);
      const sellingPrice = retailPrice && retailExchangeRate ? convertMoney(retailPrice.amount, retailExchangeRate) : null;
      const costSameCurrency = costPrice?.currencyCode === estimate.currencyCode;
      const costExchangeRate = !costPrice?.currencyCode ? null : costSameCurrency ? 1 : resolveCurrencyRate(costPrice.currencyCode, estimate.currencyCode, costRateSnapshot!.mdlPerUsdRate);
      const convertedCost = costPrice && costExchangeRate ? convertMoney(costPrice.amount, costExchangeRate) : null;
      return {
        lineType: "product",
        productId: product.id,
        serviceId: null,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        sourceUnitPrice: costPrice?.amount ?? null,
        sourceCurrencyCode: costPrice?.currencyCode ?? null,
        sourceSnapshotAt: costPrice?.lastUpdatedAt ?? null,
        convertedCostUnitPrice: convertedCost,
        exchangeRate: costExchangeRate,
        exchangeRateEffectiveDate: canViewPartnerPrice
          ? costSameCurrency ? costPrice?.lastUpdatedAt?.slice(0, 10) ?? null : costRateSnapshot?.effectiveDate ?? null
          : null,
        description: product.name,
        quantity: quantityById.get(product.id) ?? 1,
        unit: "pcs",
        sellingUnitPrice: sellingPrice,
      };
    });
    return lines;
  }

  async addService(userId: string, estimateId: string, expectedRevision: number, serviceId: string, quantity: number, sellingUnitPrice: number, insertion: EstimateLineInsertion): Promise<EstimateDetailDto> {
    return this.addServices(userId, estimateId, expectedRevision, [{ serviceId, quantity, sellingUnitPrice }], insertion);
  }

  async addServices(userId: string, estimateId: string, expectedRevision: number, selections: EstimateServiceSelection[], insertion: EstimateLineInsertion): Promise<EstimateDetailDto> {
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
    await this.addLinesSafely(estimateId, expectedRevision, lines, insertion);
    return this.getDetail(userId, estimateId);
  }

  async addCustomLine(userId: string, estimateId: string, expectedRevision: number, description: string, unit: EstimateUnit, quantity: number, sellingUnitPrice: number, insertion: EstimateLineInsertion): Promise<EstimateDetailDto> {
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
    }], insertion);
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
    const existingSectionsById = new Map(aggregate.sections.map((section) => [section.id, section]));
    const sectionIds = new Set<string>();
    const sections = input.sections.map((section, index) => {
      const id = normalizeUuid(section.id, "Раздел сметы некорректен.");
      if (sectionIds.has(id)) throw new InvalidStateError("Разделы сметы не должны повторяться.");
      sectionIds.add(id);
      const existing = existingSectionsById.get(id);
      const canonical = existing?.systemKey ? CANONICAL_ESTIMATE_SECTION_BY_KEY.get(existing.systemKey) : null;
      if (canonical && (
        section.name.trim() !== canonical.name
        || index !== canonicalSectionOrder(existing!.systemKey ?? null)
        || section.showSubtotal !== true
        || Number(section.discountPercent) !== 0
      )) {
        throw new InvalidStateError("Системные разделы сметы нельзя переименовывать, перемещать или изменять.");
      }
      return {
        id,
        name: canonical?.name ?? normalizeRequired(section.name, 120, "Название раздела некорректно."),
        sortOrder: canonical ? canonicalSectionOrder(existing!.systemKey ?? null) : index,
        showSubtotal: canonical ? true : section.showSubtotal,
        discountPercent: canonical ? 0 : normalizePercentage(section.discountPercent, "Скидка раздела должна быть от 0 до 100%."),
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
    const requestedVatMode = normalizeVatMode(input.vatMode);
    const vatMode: EstimateVatMode = requestedVatMode === "none"
      ? "none"
      : aggregate.estimate.vatMode === "included" && requestedVatMode === "included"
        ? "included"
        : "separate";
    const vatRatePercent = vatMode === "none" ? 0 : 20;
    calculateEstimateCommercials({ lines, sections, charges, globalDiscountPercent, vatMode, vatRatePercent });

    return {
      estimateId: aggregate.estimate.id,
      expectedRevision: input.expectedRevision,
      settings: {
        ...metadata,
        finalCustomerId: input.finalCustomerId
          ? normalizeUuid(input.finalCustomerId, "Выберите заказчика.")
          : aggregate.estimate.finalCustomerId ?? null,
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

  private async addLinesSafely(estimateId: string, expectedRevision: number, lines: AddEstimateLineInput[], insertion: EstimateLineInsertion) {
    const targetSectionId = normalizeUuid(insertion.targetSectionId, "Раздел для добавления позиции некорректен.");
    const requestKey = normalizeUuid(insertion.requestKey, "Ключ добавления позиции некорректен.");
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ targetSectionId, lines })).digest("hex");
    try {
      await this.repository.addLines({ estimateId, expectedRevision, targetSectionId, requestKey, requestFingerprint, lines });
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

  async deleteArchived(userId: string, estimateId: string, expectedRevision: number, requestKey: string): Promise<void> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const normalizedEstimateId = normalizeId(estimateId);
    const estimate = await this.repository.findById(normalizedEstimateId);
    if (!estimate || estimate.companyId !== companyId) throw new NotFoundError("Estimate was not found.");
    if (estimate.status !== "archived") throw new InvalidStateError("Удалить можно только архивную смету.");
    if (estimate.revision !== normalizeRevision(expectedRevision)) throw new InvalidStateError("Смета была изменена. Обновите архив и повторите действие.");
    try {
      await this.repository.deleteArchived(normalizedEstimateId, estimate.revision, normalizeUuid(requestKey, "Ключ удаления некорректен."), "Удалено пользователем из архива.");
    } catch (error) {
      if (error instanceof EstimateRepositoryError && error.code === "invalid") {
        throw new InvalidStateError("Смету нельзя удалить: у неё есть защищённая история предложения или заказа.");
      }
      handleRepositoryConflict(error);
    }
  }

  async addExternalLine(userId: string, estimateId: string, expectedRevision: number, input: ExternalNomenclatureInput): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    const existingExternalItemId = input.existingExternalItemId ? normalizeUuid(input.existingExternalItemId, "Внешняя позиция некорректна.") : null;
    const normalized = {
      manufacturer: normalizeOptional(input.manufacturer ?? undefined, 120) ?? null,
      model: normalizeOptional(input.model ?? undefined, 160) ?? null,
      name: normalizeRequired(input.name, 300, "Укажите название позиции."),
      category: normalizeOptional(input.category ?? undefined, 160) ?? null,
      unit: normalizeUnit(input.unit),
      specification: normalizeOptional(input.specification ?? undefined, 2000) ?? null,
      quantity: normalizeQuantity(input.quantity),
      sellingUnitPrice: normalizeMoney(input.sellingUnitPrice),
      forceCreateNew: input.forceCreateNew === true,
    };
    const requestKey = normalizeUuid(input.requestKey, "Ключ добавления позиции некорректен.");
    const targetSectionId = normalizeUuid(input.targetSectionId, "Раздел для добавления позиции некорректен.");
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ targetSectionId, existingExternalItemId, ...normalized })).digest("hex");
    try {
      if (!this.repository.addExternalLine) throw new InvalidStateError("Добавление внешних позиций временно недоступно.");
      await this.repository.addExternalLine({ estimateId, expectedRevision, targetSectionId, requestKey, requestFingerprint, existingExternalItemId, ...normalized });
    } catch (error) {
      if (error instanceof EstimateRepositoryError && error.code === "duplicate") {
        throw new InvalidStateError("Похожая позиция уже существует в системе. Выберите существующую позицию, чтобы не создавать дубликат.");
      }
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  async addSection(userId: string, estimateId: string, expectedRevision: number, insertion: EstimateSectionInsertion): Promise<EstimateDetailDto> {
    await this.ensureDraft(userId, estimateId, PRICING_PERMISSION, expectedRevision);
    const name = normalizeRequired(insertion.name, 120, "Название раздела некорректно.");
    const requestKey = normalizeUuid(insertion.requestKey, "Ключ добавления раздела некорректен.");
    const requestFingerprint = createHash("sha256").update(JSON.stringify({ name })).digest("hex");
    try {
      await this.repository.addSection({ estimateId, expectedRevision, requestKey, requestFingerprint, name });
    } catch (error) {
      handleRepositoryConflict(error);
    }
    return this.getDetail(userId, estimateId);
  }

  private async canViewPartnerPrice(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const context = await this.permissionService.getEffectivePermissionContext(
      userId,
      companyId,
    );
    return resolveCommercialVisibility(context).canViewPartnerPrice;
  }
}

export function projectEstimateDetail(
  detail: EstimateDetailDto,
  canViewPartnerPrice: boolean,
): EstimateDetailDto {
  if (canViewPartnerPrice) return detail;
  const {
    currencyRate: _currencyRate,
    currencyRateEffectiveDate: _currencyRateEffectiveDate,
    ...safeDetail
  } = detail;
  const {
    grossProfit: _grossProfit,
    overallMarginPercent: _overallMarginPercent,
    ...safeTotals
  } = detail.totals;

  return {
    ...safeDetail,
    commercialMode: "retail_only",
    totals: safeTotals,
    lines: detail.lines.map((line) => {
      const {
        sourcePrice: _sourcePrice,
        sourceCurrencyCode: _sourceCurrencyCode,
        sourceSnapshotAt: _sourceSnapshotAt,
        internalCostUnitPrice: _internalCostUnitPrice,
        convertedCostUnitPrice: _convertedCostUnitPrice,
        exchangeRate: _exchangeRate,
        exchangeRateEffectiveDate: _exchangeRateEffectiveDate,
        markupPercent: _markupPercent,
        marginPercent: _marginPercent,
        ...safeLine
      } = line;
      return {
        ...safeLine,
        pricingMode: "direct",
        pricingInputValue: line.sellingUnitPrice,
      };
    }),
  };
}

function preserveConfidentialEstimateInputs(
  aggregate: EstimateAggregate,
  input: SaveEstimateCommercialCommand,
): SaveEstimateCommercialCommand {
  const existingById = new Map(aggregate.items.map((item) => [item.id, item]));
  return {
    ...input,
    lines: input.lines.map((line) => {
      const existing = existingById.get(line.id);
      if (!existing) return line;
      return {
        ...line,
        pricingMode: "direct",
        internalCostUnitPrice: existing.internalCostUnitPrice,
      };
    }),
  };
}

function normalizeMetadata(input: Pick<CreateEstimateCommand, "name" | "customerName" | "projectName" | "currencyCode" | "validityDays">) {
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

function normalizeExternalItemType(value: ExternalNomenclatureItemType): ExternalNomenclatureItemType {
  if (!(["equipment", "material", "service"] as const).includes(value)) throw new InvalidStateError("Тип номенклатуры некорректен.");
  return value;
}

function normalizePartnerNomenclatureInput(input: PartnerNomenclatureInput, itemType: ExternalNomenclatureItemType) {
  return {
    manufacturer: itemType === "service" ? normalizeOptional(input.manufacturer ?? undefined, 120) ?? null : normalizeRequired(input.manufacturer ?? "", 120, "Укажите производителя."),
    model: itemType === "service" ? normalizeOptional(input.model ?? undefined, 160) ?? null : normalizeRequired(input.model ?? "", 160, "Укажите модель."),
    name: normalizeRequired(input.name, 300, "Укажите название позиции."),
    category: normalizeOptional(input.category ?? undefined, 160) ?? null,
    unit: normalizeUnit(input.unit),
    specification: normalizeOptional(input.specification ?? undefined, 2000) ?? null,
  };
}

function normalizeStatus(value: EstimateStatus | undefined): EstimateStatus | undefined {
  return value && (["draft", "ready", "sent", "accepted", "rejected", "archived"] as const).includes(value) ? value : undefined;
}

function normalizeLifecycleStatus(value: EstimateLifecycleStatus | undefined): EstimateLifecycleStatus | undefined {
  return value && (["draft", "sent", "accepted", "rejected", "expired", "converted_to_order"] as const).includes(value) ? value : undefined;
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

function toCommercialDetail(aggregate: EstimateAggregate, images = new Map<string, string | null>()): EstimateDetailDto {
  const { estimate, items, sections, charges } = aggregate;
  const calculated = calculateEstimateCommercials({
    lines: items.map((item) => ({
      id: item.id,
      sectionId: item.sectionId,
      quantity: item.quantity,
      pricingMode: item.pricingMode,
      pricingInputValue: resolvePricingInputValue(item),
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
    finalCustomerId: estimate.finalCustomerId,
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
    lifecycleStatus: estimate.lifecycleStatus ?? "draft",
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
      systemKey: section.systemKey,
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
        externalNomenclatureId: item.externalNomenclatureId,
        externalDemand: item.externalDemand ?? null,
        imageUrl: item.productId
          ? images.get(item.productId) ?? null
          : item.externalNomenclatureId
            ? `/api/nomenclature/covers/${item.externalNomenclatureId}`
            : null,
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
        pricingInputValue: resolvePricingInputValue(item),
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

function normalizeNonnegativeVersion(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new InvalidStateError("Версия номенклатуры некорректна.");
  return value;
}

function resolvePricingInputValue(item: EstimateItem): number | null {
  if (item.pricingInputValue !== null) return item.pricingInputValue;
  return item.pricingMode === "direct" ? item.sellingUnitPrice : null;
}

function legacyToDetail(estimate: Estimate, items: EstimateItem[]) {
  return {
    id: estimate.id,
    estimateNumber: estimate.estimateNumber,
    name: estimate.name,
    finalCustomerId: estimate.finalCustomerId,
    customerName: estimate.customerName,
    projectName: estimate.projectName,
    currencyCode: estimate.currencyCode,
    validityDays: estimate.validityDays,
    status: estimate.status,
    lifecycleStatus: estimate.lifecycleStatus ?? "draft",
    revision: estimate.revision,
    updatedAt: estimate.updatedAt,
    total: formatMoney(estimate.totalAmount, estimate.currencyCode),
    hasIncompletePricing: estimate.hasIncompletePricing,
    itemCount: items.length,
    lines: items.map((item) => ({
      id: item.id,
      lineType: item.lineType,
      productId: item.productId,
      externalNomenclatureId: item.externalNomenclatureId,
      externalDemand: item.externalDemand ?? null,
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

function normalizeIndustryCode(value: FinalCustomerIndustryCode | null | undefined): FinalCustomerIndustryCode | null {
  if (value === null || value === undefined) return null;
  if (!isFinalCustomerIndustryCode(value)) throw new InvalidStateError("Выберите отрасль из списка.");
  return value;
}

function sameMoney(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.005;
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
