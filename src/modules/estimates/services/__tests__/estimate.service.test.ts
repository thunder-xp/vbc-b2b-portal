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
  const insertion = { targetSectionId: "11111111-1111-4111-8111-111111111111", requestKey: "22222222-2222-4222-8222-222222222222" };
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
      searchFinalCustomers: vi.fn().mockResolvedValue([]),
      listFinalCustomers: vi.fn().mockResolvedValue({ records: [], totalCount: 0 }),
      getFinalCustomerDetail: vi.fn().mockResolvedValue(null),
      createFinalCustomer: vi.fn().mockResolvedValue({ id: "customer-1", companyId: "company-1", displayName: "Customer", customerType: "company", fiscalCode: null, locality: null, industry: null, industryCode: null, revision: 1, archivedAt: null, createdAt: "2026-08-08T10:00:00Z", updatedAt: "2026-08-08T10:00:00Z" }),
      searchExternalNomenclature: vi.fn().mockResolvedValue([]),
      addExternalLine: vi.fn().mockResolvedValue(undefined),
      createFromPurchasingList: vi.fn().mockResolvedValue({ estimateId: estimate.id, repeated: false }),
      updateDraft: vi.fn().mockResolvedValue({ ...estimate, revision: 4 }),
      saveCommercialDraft: vi.fn().mockResolvedValue({ ...estimate, revision: 4 }),
      addSection: vi.fn().mockResolvedValue(undefined),
      addLines: vi.fn().mockResolvedValue(undefined),
      updateLine: vi.fn().mockResolvedValue(undefined),
      removeLine: vi.fn().mockResolvedValue(undefined),
      removeLines: vi.fn().mockResolvedValue(undefined),
      archive: vi.fn().mockResolvedValue(undefined),
      deleteArchived: vi.fn().mockResolvedValue(undefined),
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
      {
        ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }),
        hasPermission: vi.fn(),
        getEffectivePermissionContext: vi.fn().mockResolvedValue({
          effectivePermissionCodes: ["pricing.partner_price.view"],
        }),
      } as never,
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
    await service.createDraft("user-1", { name: "  Estimate  ", finalCustomerId: "11111111-1111-1111-1111-111111111111", currencyCode: "usd", validityDays: 14 });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1", name: "Estimate", currencyCode: "USD" }));
    await expect(service.createDraft("user-1", { name: "Estimate", finalCustomerId: "11111111-1111-1111-1111-111111111111", currencyCode: "EUR", validityDays: 14 })).rejects.toBeInstanceOf(InvalidStateError);
    await expect(service.createDraft("user-1", { name: "Estimate", currencyCode: "USD", validityDays: 14 })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("deletes only an archived estimate through the governed repository operation", async () => {
    vi.mocked(repository.findById).mockResolvedValue({ ...estimate, status: "archived", archivedAt: "2026-08-09T10:00:00Z" });
    await service.deleteArchived("user-1", estimate.id, estimate.revision, "33333333-3333-4333-8333-333333333333");
    expect(repository.deleteArchived).toHaveBeenCalledWith(estimate.id, estimate.revision, "33333333-3333-4333-8333-333333333333", "Удалено пользователем из архива.");
  });

  it("rejects deletion before the estimate is archived", async () => {
    await expect(service.deleteArchived("user-1", estimate.id, estimate.revision, "33333333-3333-4333-8333-333333333333")).rejects.toThrow("Удалить можно только архивную смету");
    expect(repository.deleteArchived).not.toHaveBeenCalled();
  });

  it("searches and creates final customers only through the active company boundary", async () => {
    await service.searchFinalCustomers("user-1", "Nad");
    expect(repository.searchFinalCustomers).toHaveBeenCalledWith("company-1", "Nad", 8);

    await service.createFinalCustomer("user-1", {
      displayName: " NADZOR SRL ", customerType: "company", fiscalCode: "0200046888", locality: "Chisinau",
    });
    expect(repository.createFinalCustomer).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1", displayName: "NADZOR SRL", fiscalCode: "0200046888",
    }));
  });

  it("lists final customers with bounded paging and governed industry", async () => {
    await service.listFinalCustomers("user-1", { search: "Nad", industryCode: "security_integrator", page: 2 });
    expect(repository.listFinalCustomers).toHaveBeenCalledWith({
      companyId: "company-1", search: "Nad", industryCode: "security_integrator", limit: 20, offset: 20,
    });
  });

  it("warns before creating an obvious duplicate final customer", async () => {
    vi.mocked(repository.createFinalCustomer!).mockRejectedValue(new EstimateRepositoryError("duplicate"));
    await expect(service.createFinalCustomer("user-1", { displayName: "NADZOR", customerType: "company" }))
      .rejects.toThrow("Похожий заказчик уже существует");
  });

  it("does not expose an estimate from another company", async () => {
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate([], { companyId: "company-2" }));
    await expect(service.getDetail("user-1", "estimate-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bulk-loads selected products and commercial values once", async () => {
    await service.addProducts("user-1", "estimate-1", 3, [
      { productId: "product-1", quantity: 2 },
      { productId: "product-1", quantity: 3 },
    ], insertion);

    expect(catalog.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(catalog.getProductsByIds).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledWith(expect.objectContaining({ estimateId: "estimate-1", expectedRevision: 3, targetSectionId: insertion.targetSectionId, requestKey: insertion.requestKey, lines: [expect.objectContaining({ productId: "product-1", quantity: 3, sellingUnitPrice: 50.13 })] }));
    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.findAggregateById).toHaveBeenCalledTimes(1);
  });

  it("adds controlled services and custom lines through server validation", async () => {
    await service.addService("user-1", "estimate-1", 3, "service-1", 2, 15.555, insertion);
    expect(repository.addLines).toHaveBeenLastCalledWith(expect.objectContaining({ targetSectionId: insertion.targetSectionId, lines: [expect.objectContaining({ lineType: "service", serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.56 })] }));

    await service.addCustomLine("user-1", "estimate-1", 3, "  Кабельные работы  ", "meter", 10.5, 4.2, insertion);
    expect(repository.addLines).toHaveBeenLastCalledWith(expect.objectContaining({ targetSectionId: insertion.targetSectionId, lines: [expect.objectContaining({ lineType: "custom", description: "Кабельные работы", unit: "meter", quantity: 10.5, sellingUnitPrice: 4.2 })] }));
  });

  it("adds several controlled services through one repository mutation", async () => {
    const secondService = { ...serviceRecord, id: "service-2", name: "Настройка системы" };
    vi.mocked(repository.listServices).mockResolvedValue([serviceRecord, secondService]);

    await service.addServices("user-1", "estimate-1", 3, [
      { serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.555 },
      { serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 },
    ], insertion);

    expect(repository.listServices).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledTimes(1);
    expect(repository.addLines).toHaveBeenCalledWith(expect.objectContaining({ lines: [
      expect.objectContaining({ serviceId: "service-1", quantity: 2, sellingUnitPrice: 15.56 }),
      expect.objectContaining({ serviceId: "service-2", quantity: 1, sellingUnitPrice: 25 }),
    ] }));
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

  it("reuses the catalog aggregate commercial projection in product search", async () => {
    vi.mocked(catalog.listProducts).mockResolvedValue({
      products: [{ id: "product-1", sku: "200007", name: "U-POE-af", slug: "u-poe-af", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }],
      page: 1,
      pageSize: 12,
      hasNextPage: false,
      isDemoData: false,
      totalCount: 1,
      facets: [],
      commercialViews: [{ productId: "product-1", partnerPrice: { amount: 50.125, currencyCode: "USD", formattedAmount: "$50.13", lastUpdatedAt: "2026-07-16T09:00:00Z" }, retailPrice: null, stock: null, isDemoData: false }],
    });

    const result = await service.searchProducts("user-1", { search: "200007" });

    expect(result.products).toEqual([expect.objectContaining({ id: "product-1", partnerPrice: "$50.13" })]);
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
  });

  it("offers governed USD and MDL when a published conversion rate exists", async () => {
    vi.mocked(pricing.listAvailableCurrencyCodes!).mockResolvedValue(["USD", "MDL"]);
    await expect(service.listAvailableCurrencies("user-1")).resolves.toEqual(["USD", "MDL"]);
    expect(pricing.getApprovedUsdMdlRateSnapshot).not.toHaveBeenCalled();
  });

  it("searches the shared library once and adds an external line through one atomic call", async () => {
    vi.mocked(repository.searchExternalNomenclature!).mockResolvedValue([{ id: "external-1", manufacturer: "Ajax", model: "Hub 2", name: "Hub", category: null, unit: "pcs", specification: null, exactIdentityMatch: true }]);
    await expect(service.searchExternalNomenclature("user-1", "Ajax Hub 2")).resolves.toHaveLength(1);
    await service.addExternalLine("user-1", "estimate-1", 3, {
      existingExternalItemId: "11111111-1111-4111-8111-111111111111",
      manufacturer: "Ajax", model: "Hub 2", name: "Hub", unit: "pcs",
      quantity: 1, sellingUnitPrice: 100, forceCreateNew: false,
      requestKey: "22222222-2222-4222-8222-222222222222",
      targetSectionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(repository.searchExternalNomenclature).toHaveBeenCalledTimes(1);
    expect(repository.addExternalLine).toHaveBeenCalledTimes(1);
    expect(repository.addExternalLine).toHaveBeenCalledWith(expect.objectContaining({ existingExternalItemId: "11111111-1111-4111-8111-111111111111", forceCreateNew: false }));
  });

  it("creates a section through one governed idempotent repository call", async () => {
    await service.addSection("user-1", estimate.id, 3, {
      name: "Монтаж",
      requestKey: "22222222-2222-4222-8222-222222222222",
    });

    expect(repository.addSection).toHaveBeenCalledTimes(1);
    expect(repository.addSection).toHaveBeenCalledWith(expect.objectContaining({
      estimateId: estimate.id,
      expectedRevision: 3,
      name: "Монтаж",
      requestKey: "22222222-2222-4222-8222-222222222222",
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("uses the permitted retail rate without storing partner cost", async () => {
    const permission = Reflect.get(service, "permissionService") as {
      getEffectivePermissionContext: ReturnType<typeof vi.fn>;
    };
    permission.getEffectivePermissionContext.mockResolvedValue({
      effectivePermissionCodes: ["pricing.retail_price.view"],
    });
    pricing.getRetailUsdMdlRateSnapshot = vi.fn().mockResolvedValue({
      sourceCode: "113",
      mdlPerUsdRate: 17.5,
      effectiveDate: "2026-07-16",
      publishedAt: "2026-07-16T09:00:00Z",
    });
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{
      productId: "product-1",
      partnerPrice: null,
      retailPrice: {
        amount: 1750,
        currencyCode: "MDL",
        formattedAmount: "1 750,00 MDL",
        lastUpdatedAt: "2026-07-16T09:00:00Z",
      },
      stock: null,
      isDemoData: false,
      retailBelowPartnerPrice: false,
    }]);

    await service.addProducts("user-1", "estimate-1", 3, [
      { productId: "product-1", quantity: 1 },
    ], insertion);

    expect(pricing.getRetailUsdMdlRateSnapshot).toHaveBeenCalledOnce();
    expect(repository.addLines).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        sourceUnitPrice: null,
        sourceCurrencyCode: null,
        convertedCostUnitPrice: null,
        sellingUnitPrice: 100,
      })],
    }));
  });

  it("omits confidential estimate fields for retail-only users", async () => {
    const permission = Reflect.get(service, "permissionService") as {
      getEffectivePermissionContext: ReturnType<typeof vi.fn>;
    };
    permission.getEffectivePermissionContext.mockResolvedValue({
      effectivePermissionCodes: ["pricing.retail_price.view"],
    });
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate([{
      ...item(1),
      sourceUnitPrice: 50.125,
      sourceCurrencyCode: "USD",
      internalCostUnitPrice: 50.125,
      convertedCostUnitPrice: 50.125,
      pricingMode: "markup",
      pricingInputValue: 80,
      sellingUnitPrice: 90.23,
    }]));

    const detail = await service.getDetail("user-1", "estimate-1");
    const serialized = JSON.stringify(detail);

    expect(detail).toMatchObject({ commercialMode: "retail_only" });
    expect(detail.lines[0]).toMatchObject({
      pricingMode: "direct",
      pricingInputValue: 90.23,
    });
    expect(serialized).not.toContain("sourcePrice");
    expect(serialized).not.toContain("internalCostUnitPrice");
    expect(serialized).not.toContain("markupPercent");
    expect(serialized).not.toContain("marginPercent");
    expect(serialized).not.toContain("50.125");
  });

  it("preserves user-entered Unicode in one atomic commercial draft mutation", async () => {
    const sectionId = "11111111-1111-1111-1111-111111111111";
    const itemId = "22222222-2222-2222-2222-222222222222";
    const commercialAggregate = aggregate([{ ...item(1), id: itemId, sectionId }]);
    commercialAggregate.sections = [{ ...commercialAggregate.sections[0], id: sectionId }];
    vi.mocked(repository.findAggregateById).mockResolvedValue(commercialAggregate);

    await service.saveCommercialDraft("user-1", estimate.id, {
      expectedRevision: 3,
      name: "Тестовая смета №1",
      customerName: "Echipamente Chișinău",
      projectName: "Проект Chișinău 2026",
      validityDays: 30,
      currencyCode: "USD",
      currencyChangePolicy: "preserve_manual",
      vatMode: "separate",
      vatRatePercent: 20,
      globalDiscountPercent: 0,
      sections: [{ id: sectionId, name: "Система видеонаблюдения", sortOrder: 0, showSubtotal: true, discountPercent: 0 }],
      lines: [{ id: itemId, sectionId, position: 1, description: "Камеры / NVR / HDD", quantity: 2, unit: "pcs", pricingMode: "direct", pricingInputValue: 10, internalCostUnitPrice: 5, lineDiscountPercent: 0 }],
      charges: [{ id: "33333333-3333-3333-3333-333333333333", chargeType: "other", description: "Condiții speciale", amount: 0, vatApplicable: false, customerVisible: true, sortOrder: 0 }],
    });

    expect(repository.saveCommercialDraft).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        name: "Тестовая смета №1",
        customerName: "Echipamente Chișinău",
        projectName: "Проект Chișinău 2026",
      }),
      sections: [expect.objectContaining({ name: "Система видеонаблюдения" })],
      lines: [expect.objectContaining({ description: "Камеры / NVR / HDD" })],
      charges: [expect.objectContaining({ description: "Condiții speciale" })],
    }));
  });

  it("bulk-resolves product thumbnails once without querying for service or custom lines", async () => {
    const productLine = { ...item(1), lineType: "product" as const, productId: "product-1", skuSnapshot: "400691", productNameSnapshot: "Camera" };
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate([productLine, item(2)]));
    vi.mocked(catalog.getProductsByIds).mockResolvedValue([{ id: "product-1", sku: "400691", name: "Camera", slug: "camera", shortDescription: null, imageUrl: "https://example.test/camera-thumb.jpg", brand: null, category: null, keyCharacteristics: [], datasheet: null }]);

    const detail = await service.getDetail("user-1", "estimate-1");

    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(catalog.getProductsByIds).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(detail.lines[0]).toMatchObject({ lineType: "product", imageUrl: "https://example.test/camera-thumb.jpg" });
    expect(detail.lines[1]).toMatchObject({ lineType: "custom", imageUrl: null });
  });

  it("checks current product prices and stock through one commercial batch", async () => {
    const productLine = { ...item(1), lineType: "product" as const, productId: "product-1", skuSnapshot: "400691", productNameSnapshot: "Camera", sellingUnitPrice: 60 };
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate([productLine]));
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{
      productId: "product-1",
      partnerPrice: { amount: 50, currencyCode: "USD", formattedAmount: "$50.00", lastUpdatedAt: "2026-07-29T08:00:00Z" },
      retailPrice: null,
      stock: { status: "in_stock", label: "В наличии: 8 шт.", exactPhysicalQuantity: 8, exactReservedQuantity: 0, exactAvailableQuantity: 8, exactIncomingQuantity: 0, hasVariantStock: false, expectedArrival: null, lastUpdatedAt: "2026-07-29T08:00:00Z" },
      isDemoData: false,
      retailBelowPartnerPrice: false,
    }]);

    const result = await service.checkCurrentProductState("user-1", "estimate-1");

    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
    expect(result.lines[0]).toMatchObject({ oldPrice: 60, currentPrice: 50, priceChanged: true, currentStock: "В наличии: 8 шт." });
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
