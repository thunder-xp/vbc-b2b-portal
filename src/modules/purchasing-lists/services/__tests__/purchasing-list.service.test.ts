import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogService } from "../../../catalog/services";
import type { CartService } from "../../../orders/services";
import type { PartnerOrderHistoryRepository } from "../../../orders/repositories";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { PurchasingListRepository, PurchasingListRecord } from "../../repositories";
import type { PurchasingListEstimateGateway } from "../purchasing-list.service";
import { PurchasingListService } from "../purchasing-list.service";

const USER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const LIST = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "55555555-5555-4555-8555-555555555555";
const ORDER = "66666666-6666-4666-8666-666666666666";
const LINE = "77777777-7777-4777-8777-777777777777";
const REQUEST = "88888888-8888-4888-8888-888888888888";

describe("PurchasingListService", () => {
  let repository: PurchasingListRepository; let catalog: CatalogService; let pricing: PricingInventoryService;
  let cart: CartService; let history: PartnerOrderHistoryRepository; let estimate: PurchasingListEstimateGateway; let service: PurchasingListService;
  const companyAccess = { getOwnMemberships: vi.fn(), getActiveCompanyContext: vi.fn(), validateCompanyAccess: vi.fn(), ensureActiveMembership: vi.fn() };
  const permission = { ensurePermission: vi.fn(), hasPermission: vi.fn() };

  beforeEach(() => {
    companyAccess.getOwnMemberships.mockResolvedValue([{ companyId: COMPANY, status: "active" }]);
    companyAccess.getActiveCompanyContext.mockResolvedValue({ company: { id: COMPANY }, membership: {}, user: {} });
    permission.ensurePermission.mockResolvedValue(undefined); permission.hasPermission.mockResolvedValue(true);
    repository = { list: vi.fn().mockResolvedValue({ records: [{ ...record(), items: undefined, itemCount: 1, totalQuantity: 2, productIds: [PRODUCT] }], totalCount: 1 }), findById: vi.fn().mockResolvedValue(record()), create: vi.fn().mockResolvedValue(record()), updateMetadata: vi.fn().mockResolvedValue(record()), mergeItems: vi.fn().mockResolvedValue(record()), updateItems: vi.fn().mockResolvedValue(record()), removeItems: vi.fn().mockResolvedValue(record()), setArchived: vi.fn().mockResolvedValue(record()), duplicate: vi.fn().mockResolvedValue(record()), mergeIntoCart: vi.fn().mockResolvedValue({ cartId: "99999999-9999-4999-8999-999999999999", repeated: false }) };
    catalog = { listCategories: vi.fn(), listBrands: vi.fn(), listProducts: vi.fn(), getProductDetailBySlug: vi.fn(), getProductsByIds: vi.fn().mockResolvedValue([product()]), getProductOrderIdentities: vi.fn() };
    pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([commercial()]) };
    cart = { getCart: vi.fn(), getItemCount: vi.fn(), addItem: vi.fn(), updateQuantity: vi.fn(), removeItem: vi.fn(), mergeEstimateProducts: vi.fn(), getEstimateSource: vi.fn().mockResolvedValue({ companyId: COMPANY, cartId: ORDER, lines: [{ productId: PRODUCT, sku: "400691", productName: "Camera", quantity: 2, partnerPrice: 10, currencyCode: "USD", priceUpdatedAt: "2026-07-20T00:00:00Z" }] }) };
    history = { getReorderSource: vi.fn().mockResolvedValue(orderSource()), listVisible: vi.fn(), findVisibleById: vi.fn(), listItemsByOrderIds: vi.fn(), listEvents: vi.fn(), getSyncState: vi.fn(), startSync: vi.fn(), upsertBatch: vi.fn(), completeSync: vi.fn(), failSync: vi.fn() };
    estimate = { createFromPurchasingList: vi.fn().mockResolvedValue({ estimateId: ORDER, repeated: false, added: 1, skipped: 0 }) };
    service = new PurchasingListService(repository, companyAccess as never, permission as never, catalog, pricing, cart, history, estimate);
  });

  it.each(["private", "company"] as const)("creates a %s list with server-resolved company", async (visibility) => {
    await service.createManual(USER, { name: "  Cameras  ", visibility });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, name: "Cameras", visibility, items: [] }));
  });

  it("creates from cart in one aggregate mutation without changing cart", async () => {
    await service.createFromCart(USER, { name: "Cart list", visibility: "private" });
    expect(cart.getEstimateSource).toHaveBeenCalledOnce(); expect(repository.create).toHaveBeenCalledOnce(); expect(cart.removeItem).not.toHaveBeenCalled();
  });

  it("creates from historical order and excludes unresolved lines", async () => {
    const result = await service.createFromOrder(USER, { orderId: ORDER, name: "Old order", visibility: "private" });
    expect(result.skipped).toBe(1); expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "order", items: [expect.objectContaining({ productId: PRODUCT, quantity: 2 })] }));
  });

  it("creates from Quick Reorder selected quantities without mutating cart", async () => {
    await service.createFromOrder(USER, { orderId: ORDER, name: "Selected", visibility: "private", selections: [{ lineId: LINE, quantity: 7 }] });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "quick_reorder", items: [expect.objectContaining({ quantity: 7 })] })); expect(repository.mergeIntoCart).not.toHaveBeenCalled();
  });

  it.each(["increase", "replace", "keep"] as const)("uses explicit %s duplicate behavior", async (mergeMode) => {
    await service.addProduct(USER, { listId: LIST, productId: PRODUCT, quantity: 2, mergeMode });
    expect(repository.mergeItems).toHaveBeenCalledWith(expect.objectContaining({ mergeMode }));
  });

  it("updates quantities and ordering in one bounded repository call", async () => {
    await service.updateItems(USER, LIST, 1, [{ itemId: ITEM, quantity: 5, position: 1 }]);
    expect(repository.updateItems).toHaveBeenCalledOnce();
  });

  it("duplicates without changing the source", async () => { await service.duplicate(USER, LIST); expect(repository.duplicate).toHaveBeenCalledOnce(); expect(repository.updateMetadata).not.toHaveBeenCalled(); });

  it("loads index commercial data once for all products", async () => { await service.list(USER); expect(catalog.getProductsByIds).toHaveBeenCalledOnce(); expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce(); });
  it("loads manageable catalog dialog choices without commercial projections", async () => { await service.listManageableChoices(USER); expect(repository.list).toHaveBeenCalledOnce(); expect(catalog.getProductsByIds).not.toHaveBeenCalled(); expect(pricing.getProductCommercialViews).not.toHaveBeenCalled(); });
  it("loads detail product and commercial data in bulk", async () => { await service.getDetail(USER, LIST); expect(catalog.getProductsByIds).toHaveBeenCalledOnce(); expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce(); });

  it("classifies an inactive product", async () => { vi.mocked(catalog.getProductsByIds).mockResolvedValue([]); const result = await service.getDetail(USER, LIST); expect(result.lines[0].state).toBe("inactive"); });
  it("classifies missing partner price", async () => { vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{ ...commercial(), partnerPrice: null }]); const result = await service.getDetail(USER, LIST); expect(result.lines[0].state).toBe("missing_price"); });
  it("marks a changed source price while keeping the current price eligible", async () => { vi.mocked(repository.findById).mockResolvedValue(record({ items: [{ ...record().items[0], sourceUnitPrice: 9, sourceCurrencyCode: "USD" }] })); const result = await service.getDetail(USER, LIST); expect(result.lines[0]).toMatchObject({ state: "price_changed", canConvert: true, currentPartnerPriceAmount: 10 }); });
  it("requires review for stale current pricing and excludes it from conversion", async () => { vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{ ...commercial(), partnerPrice: { ...commercial().partnerPrice!, lastUpdatedAt: "2020-01-01T00:00:00Z" } }]); const result = await service.addToCart(USER, { listId: LIST, requestKey: REQUEST }); expect(result.skipped).toBe(1); expect(repository.mergeIntoCart).not.toHaveBeenCalled(); });

  it("adds selected valid products through one idempotent cart mutation", async () => { const result = await service.addToCart(USER, { listId: LIST, requestKey: REQUEST, itemIds: [ITEM] }); expect(repository.mergeIntoCart).toHaveBeenCalledOnce(); expect(result.added).toBe(1); });
  it("returns the prior idempotent cart result", async () => { vi.mocked(repository.mergeIntoCart).mockResolvedValue({ cartId: ORDER, repeated: true }); const result = await service.addToCart(USER, { listId: LIST, requestKey: REQUEST }); expect(result.repeated).toBe(true); });
  it("allows a deliberate second add with a new operation key", async () => { await service.addToCart(USER, { listId: LIST, requestKey: REQUEST }); await service.addToCart(USER, { listId: LIST, requestKey: "99999999-9999-4999-8999-999999999998" }); expect(repository.mergeIntoCart).toHaveBeenCalledTimes(2); });
  it("skips missing-price products without trusting client prices", async () => { vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{ ...commercial(), partnerPrice: null }]); const result = await service.addToCart(USER, { listId: LIST, requestKey: REQUEST }); expect(result.missingPrice).toBe(1); expect(repository.mergeIntoCart).not.toHaveBeenCalled(); });

  it("creates an estimate from selected items through the estimate service gateway", async () => { const result = await service.createEstimate(USER, { listId: LIST, name: "Estimate", requestKey: REQUEST, itemIds: [ITEM] }); expect(estimate.createFromPurchasingList).toHaveBeenCalledOnce(); expect(result.estimateId).toBe(ORDER); });
  it("never creates an order", async () => { await service.createEstimate(USER, { listId: LIST, name: "Estimate", requestKey: REQUEST }); expect(history.upsertBatch).not.toHaveBeenCalled(); });

  it("denies archived list conversion", async () => { vi.mocked(repository.findById).mockResolvedValue(record({ archivedAt: "2026-07-20T00:00:00Z" })); await expect(service.addToCart(USER, { listId: LIST, requestKey: REQUEST })).rejects.toThrow(); });
  it("denies cross-company list access", async () => { vi.mocked(repository.findById).mockResolvedValue(record({ companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })); await expect(service.getDetail(USER, LIST)).rejects.toThrow(); });
});

function record(overrides: Partial<PurchasingListRecord> = {}): PurchasingListRecord { return { id: LIST, companyId: COMPANY, name: "Install kit", description: null, visibility: "private", createdBy: USER, updatedBy: USER, revision: 1, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", archivedAt: null, ownerName: "Partner", items: [{ id: ITEM, listId: LIST, productId: PRODUCT, quantity: 2, position: 1, note: null, sourceType: "manual", sourceReferenceId: null, sourceUnitPrice: null, sourceCurrencyCode: null, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z" }], ...overrides }; }
function product() { return { id: PRODUCT, sku: "400691", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }; }
function commercial() { return { productId: PRODUCT, partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00", lastUpdatedAt: "2026-07-20T00:00:00Z" }, retailPrice: null, stock: { status: "in_stock" as const, label: "В наличии", exactAvailableQuantity: 5, exactPhysicalQuantity: 5, exactReservedQuantity: 0, exactIncomingQuantity: 0, expectedArrival: null, hasVariantStock: false, lastUpdatedAt: "2026-07-20T00:00:00Z" }, isDemoData: false, retailBelowPartnerPrice: false }; }
function orderSource() { return { orderId: ORDER, companyId: COMPANY, orderNumber: "NS-1", orderCurrencyCode: "USD", lines: [{ lineId: LINE, lineNumber: 1, productId: PRODUCT, historicalExternalProductRef: "x", historicalProductName: "Camera", historicalSku: "400691", historicalQuantity: 2, historicalUnitPrice: 9, historicalCurrencyCode: "USD", productExists: true, currentExternalProductRef: "x", currentName: "Camera", currentSku: "400691", currentSlug: "camera", currentImageUrl: null, currentCategoryId: null, currentIsActive: true, currentIsVisible: true }, { lineId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", lineNumber: 2, productId: null, historicalExternalProductRef: "service", historicalProductName: "Delivery", historicalSku: null, historicalQuantity: 1, historicalUnitPrice: 5, historicalCurrencyCode: "USD", productExists: false, currentExternalProductRef: null, currentName: null, currentSku: null, currentSlug: null, currentImageUrl: null, currentCategoryId: null, currentIsActive: false, currentIsVisible: false }] }; }
