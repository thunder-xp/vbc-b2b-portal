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
  validityDays: 14,
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
      updateDraft: vi.fn().mockResolvedValue({ ...estimate, revision: 4 }),
      addLines: vi.fn().mockResolvedValue(undefined),
      updateLine: vi.fn().mockResolvedValue(undefined),
      removeLine: vi.fn().mockResolvedValue(undefined),
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

  it("turns persistence revision conflicts into safe invalid-state errors", async () => {
    vi.mocked(repository.updateDraft).mockRejectedValue(new EstimateRepositoryError("conflict"));
    await expect(service.saveDraft("user-1", "estimate-1", { expectedRevision: 3, name: "Estimate", validityDays: 14 })).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("loads a 100-line editor with one aggregate read and no catalog or pricing reads", async () => {
    vi.mocked(repository.findAggregateById).mockResolvedValue(aggregate(Array.from({ length: 100 }, (_, index) => item(index + 1))));
    const detail = await service.getDetail("user-1", "estimate-1");

    expect(detail.lines).toHaveLength(100);
    expect(repository.findAggregateById).toHaveBeenCalledTimes(1);
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
    expect(detail.total).toContain("125");
  });
});

function aggregate(items: EstimateItem[], overrides: Partial<Estimate> = {}): EstimateAggregate {
  return { estimate: { ...estimate, ...overrides }, sections: [], items };
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
    description: `Line ${position}`,
    quantity: 1,
    unit: "service",
    sellingUnitPrice: 1,
    lineTotal: 1,
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
  };
}
