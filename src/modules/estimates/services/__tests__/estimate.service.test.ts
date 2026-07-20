import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidStateError, NotFoundError } from "../../../access-control/services";
import type { CatalogService } from "../../../catalog/services";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { EstimateRepository } from "../../repositories";
import { EstimateRepositoryError } from "../../repositories";
import type { Estimate, EstimateAggregate, EstimateItem, PartnerService } from "../../types";
import { DefaultEstimateService } from "../estimate.service";

const estimate: Estimate = {
  id: "estimate-1",
  companyId: "company-1",
  createdBy: "user-1",
  estimateNumber: "KP-2026-000001",
  name: "Warehouse CCTV",
  customerName: "Customer",
  projectName: "Warehouse",
  currencyCode: "USD",
  currencyRate: 1,
  currencyRateEffectiveDate: "2026-07-16",
  validityDays: 14,
  globalDiscountPercent: 0,
  vatMode: "none",
  vatRatePercent: 0,
  subtotalAmount: 125.5,
  lineDiscountTotal: 0,
  sectionDiscountTotal: 0,
  globalDiscountAmount: 0,
  chargesTotal: 0,
  vatAmount: 0,
  totalExcludingVat: 125.5,
  grossProfitAmount: null,
  overallMarginPercent: null,
  status: "draft",
  totalAmount: 125.5,
  hasIncompletePricing: false,
  revision: 3,
  archivedAt: null,
  createdAt: "2026-07-16T10:00:00Z",
  updatedAt: "2026-07-16T10:00:00Z",
};

const serviceRecord: PartnerService = {
  id: "service-1",
  companyId: null,
  name: "Монтаж видеокамеры",
  defaultUnit: "pcs",
  description: null,
  sortOrder: 10,
  defaultCost: null,
  defaultSellingPrice: null,
  vatApplicable: true,
  category: "general",
};

describe("DefaultEstimateService", () => {
  let repository: EstimateRepository;
  let catalog: CatalogService;
  let pricing: PricingInventoryService;
  let service: DefaultEstimateService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue({ records: [], totalCount: 0 }),
      findById: vi.fn().mockResolvedValue(estimate),
      findAggregateById: vi.fn().mockResolvedValue(aggregate([])),
      create: vi.fn().mockResolvedValue(estimate),
      createFromPurchasingList: vi.fn().mockResolvedValue({ estimateId: estimate.id, repeated: false }),
      updateDraft: vi.fn().mockResolvedValue({ ...estimate, revision: 4 }),
      saveCommercialDraft: vi.fn().mockResolvedValue({ ...estimate, revision: 4 }),
      addLines: vi.fn().mockResolvedValue(undefined),
      updateLine: vi.fn().mockResolvedValue(undefined),
      removeLine: vi.fn().mockResolvedValue(undefined),
      removeLines: vi.fn().mockResolvedValue(undefined),
      archive: vi.fn().mockResolvedValue(undefined),
      listServices: vi.fn().mockResolvedValue([serviceRecord]),
    };
    catalog = {
      listCategories: vi.fn().mockResolvedValue([]),
      listBrands: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn().mockResolvedValue({ products: [], page: 1, pageSize: 12, hasNextPage: false, isDemoData: false, totalCount: 0, facets: [] }),
      getProductDetailBySlug: vi.fn(),
      getProductsByIds: vi.fn().mockResolvedValue([{ id: "product-1", sku: "400691", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }]),
      getProductOrderIdentities: vi.fn(),
    };
    pricing = {
      listAvailableCurrencyCodes: vi.fn().mockResolvedValue(["MDL", "USD"]),
      getApprovedUsdMdlRateSnapshot: vi.fn().mockResolvedValue({ mdlPerUsdRate: 17.5, effectiveDate: "2026-07-16" }),
      getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: "product-1", partnerPrice: { amount: 50.125, currencyCode: "USD", formattedAmount: "$50.13", lastUpdatedAt: "2026-07-16T09:00:00Z" }, retailPrice: null, stock: null, isDemoData: false, retailBelowPartnerPrice: false }]),
    };
    service = new DefaultEstimateService(
      repository,
      {
        getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]),
        getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }),
      } as never,
      { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }), hasPermission: vi.fn() } as never,
      catalog,
      pricing,
    );
  });

  it("creates a purchasing-list estimate with one bulk commercial read and one atomic repository call", async () => {
    const result = await service.createFromPurchasingList("user-1", {
      listId: "11111111-1111-4111-8111-111111111111",
      name: "Install kit",
      requestKey: "22222222-2222-4222-8222-222222222222",
      items: [{ itemId: "33333333-3333-4333-8333-333333333333", productId: "product-1", quantity: 2 }],
    });
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(repository.createFromPurchasingList).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ estimateId: estimate.id, added: 1, skipped: 0 });
  });

  it("creates a company-owned draft only with a published currency", async () => {
    await service.createDraft("user-1", { name: "  Estimate  ", currencyCode: "usd", validityDays: 14 });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", name: "Estimate", currencyCode: "USD" }));
    await expect(service.createDraft("user-1", { name: "Estimate", currencyCode: "EUR", validityDays: 14 })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("does not expose an estimate from another company", async () => {
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate([], { companyId: "company-2" }));
    await expect(service.getDetail("user-1", "estimate-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bulk-loads selected products and commercial values once", async () => {
    await service.addProducts("user-1", "estimate-1", 3, [
      { productId: "product-1", quantity: 2 },
      { productId: "product-1", quantity: 3 },
    ]);

    expect(catalog.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(catalog.getProductsByIds).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledWith("estimate-1", 3, [expect.objectContaining({ productId: "product-1", quantity: 3, sellingUnitPrice: 50.13 })]);
    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.findAggregateById).toHaveBeenCalledTimes(1);
  });

  it("adds controlled services and custom lines through server validation", async () => {
    await service.addService("user-1", "estimate-1", 3, "service-1", 2, 15.555);
    expect(repository.addLines).toHaveBeenLastCalledWith("estimate-1", 3, [expect.objectContaining({ lineType: "service", serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.56 })]);

    await service.addCustomLine("user-1", "estimate-1", 3, "  Кабельные работы  ", "meter", 10.5, 4.2);
    expect(repository.addLines).toHaveBeenLastCalledWith("estimate-1", 3, [expect.objectContaining({ lineType: "custom", description: "Кабельные работы", unit: "meter", quantity: 10.5, sellingUnitPrice: 4.2 })]);
  });

  it("adds several controlled services through one repository mutation", async () => {
    const secondService = { ...serviceRecord, id: "service-2", name: "Настройка системы" };
    vi.mocked(repository.listServices).mockResolvedValue([serviceRecord, secondService]);

    await service.addServices("user-1", "estimate-1", 3, [
      { serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.555 },
      { serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 },
    ]);

    expect(repository.listServices).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledWith("estimate-1", 3, [
      expect.objectContaining({ serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.56 }),
      expect.objectContaining({ serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 }),
    ]);
  });

  it("turns persistence revision conflicts into safe invalid-state errors", async () => {
    vi.mocked(repository.updateDraft).mockRejectedValue(new EstimateRepositoryError("conflict"));
    await expect(service.saveDraft("user-1", "estimate-1", { expectedRevision: 3, name: "Estimate", validityDays: 14 })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("removes selected lines through one revision-protected repository mutation", async () => {
    await service.removeLines("user-1", "estimate-1", ["item-1", "item-2", "item-1"], 3);
    expect(repository.removeLines).toHaveBeenCalledTimes(1);
    expect(repository.removeLines).toHaveBeenCalledWith("estimate-1", ["item-1", "item-2"], 3);
  });

  it("saves commercial settings, sections, moves, charges, and totals through one atomic repository mutation", async () => {
    const sectionId = "11111111-1111-1111-1111-111111111111";
    const itemId = "22222222-2222-2222-2222-222222222222";
    const commercialAggregate = aggregate([{ ...item(1), id: itemId, sectionId }]);
    commercialAggregate.sections = [{ ...commercialAggregate.sections[0], id: sectionId }];
    vi.mocked(repository.findAggregateById).mockResolvedValue(commercialAggregate);

    await service.saveCommercialDraft("user-1", estimate.id, {
      expectedRevision: 3,
      name: "Commercial estimate",
      customerName: "Customer",
      projectName: "Warehouse",
      validityDays: 30,
      currencyCode: "USD",
      currencyChangePolicy: "preserve_manual",
      vatMode: "separate",
      vatRatePercent: 20,
      globalDiscountPercent: 5,
      sections: [{ id: sectionId, name: "Equipment", sortOrder: 0, showSubtotal: true, discountPercent: 3 }],
      lines: [{ id: itemId, sectionId, position: 1, description: "Line", quantity: 2, unit: "pcs", pricingMode: "direct", pricingInputValue: 10, internalCostUnitPrice: 5, lineDiscountPercent: 2 }],
      charges: [{ id: "33333333-3333-3333-3333-333333333333", chargeType: "delivery", description: "Delivery", amount: 25, vatApplicable: true, customerVisible: true, sortOrder: 0 }],
    });

    expect(repository.saveCommercialDraft).toHaveBeenCalledTimes(1);
    expect(repository.saveCommercialDraft).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 3,
      settings: expect.objectContaining({ vatMode: "separate", globalDiscountPercent: 5 }),
      sections: [expect.objectContaining({ id: sectionId, discountPercent: 3 })],
      lines: [expect.objectContaining({ id: itemId, pricingMode: "direct", lineDiscountPercent: 2 })],
      charges: [expect.objectContaining({ chargeType: "delivery", amount: 25 })],
    }));
  });

  it("converts manual prices only when convert-all is explicitly selected", async () => {
    const sectionId = "11111111-1111-1111-1111-111111111111";
    const itemId = "22222222-2222-2222-2222-222222222222";
    const commercialAggregate = aggregate([{ ...item(1), id: itemId, sectionId, pricingInputValue: 100, sellingUnitPrice: 100 }]);
    commercialAggregate.sections = [{ ...commercialAggregate.sections[0], id: sectionId }];
    vi.mocked(repository.findAggregateById).mockResolvedValue(commercialAggregate);
    const command = {
      expectedRevision: 3, name: "Estimate", customerName: null, projectName: null, validityDays: 14,
      currencyCode: "MDL", vatMode: "none" as const, vatRatePercent: 0, globalDiscountPercent: 0,
      sections: [{ id: sectionId, name: "Equipment", sortOrder: 0, showSubtotal: true, discountPercent: 0 }],
      lines: [{ id: itemId, sectionId, position: 1, description: "Line", quantity: 1, unit: "service" as const, pricingMode: "direct" as const, pricingInputValue: 100, internalCostUnitPrice: null, lineDiscountPercent: 0 }],
      charges: [],
    };
    await service.saveCommercialDraft("user-1", estimate.id, { ...command, currencyChangePolicy: "convert_all" });
    expect(vi.mocked(repository.saveCommercialDraft).mock.calls[0][0].lines[0].pricingInputValue).toBe(1750);

    vi.mocked(repository.saveCommercialDraft).mockClear();
    await service.saveCommercialDraft("user-1", estimate.id, { ...command, currencyChangePolicy: "preserve_manual" });
    expect(vi.mocked(repository.saveCommercialDraft).mock.calls[0][0].lines[0].pricingInputValue).toBe(100);
  });

  it("loads a 100-line editor with one aggregate read and no catalog or pricing reads", async () => {
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate(Array.from({ length: 100 }, (_, index) => item(index + 1))));
    const detail = await service.getDetail("user-1", "estimate-1");

    expect(detail.lines).toHaveLength(100);
    expect(repository.findAggregateById).toHaveBeenCalledTimes(1);
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
    expect(detail.total).toContain("100");
  });
});

function aggregate(items: EstimateItem[], overrides: Partial<Estimate> = {}): EstimateAggregate {
  return { estimate: { ...estimate, ...overrides }, sections: [{ id: "section-1", estimateId: estimate.id, name: "Equipment", sortOrder: 0, showSubtotal: true, discountPercent: 0, createdAt: estimate.createdAt, updatedAt: estimate.updatedAt }], items, charges: [] };
}

function item(position: number): EstimateItem {
  return {
    id: `item-${position}`,
    estimateId: estimate.id,
    sectionId: "section-1",
    lineType: "custom",
    productId: null,
    serviceId: null,
    position,
    skuSnapshot: null,
    productNameSnapshot: null,
    sourceUnitPrice: null,
    sourceCurrencyCode: null,
    sourceSnapshotAt: null,
    pricingMode: "direct",
    pricingInputValue: 1,
    internalCostUnitPrice: null,
    convertedCostUnitPrice: null,
    exchangeRate: null,
    exchangeRateEffectiveDate: null,
    lineDiscountPercent: 0,
    description: `Line ${position}`,
    quantity: 1,
    unit: "service",
    sellingUnitPrice: 1,
    lineTotal: 1,
    lineSubtotal: 1,
    lineDiscountAmount: 0,
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
  };
}
