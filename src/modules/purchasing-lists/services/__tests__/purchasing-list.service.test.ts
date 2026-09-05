import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../access-control/services";

import type { CatalogService } from "../../../catalog/services";
import type { CartService } from "../../../orders/services";
import type { PartnerOrderHistoryRepository } from "../../../orders/repositories";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import { PurchasingListRepositoryError, type PurchasingListRepository, type PurchasingListRecord } from "../../repositories";
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
    companyAccess.getOwnMemberships.mockResolvedValue([{ companyId: COMPANY, status: "active" }]);
    companyAccess.getActiveCompanyContext.mockResolvedValue({ company: { id: COMPANY }, membership: {}, user: {} });
    permission.ensurePermission.mockResolvedValue(undefined); permission.hasPermission.mockResolvedValue(true);
    repository = { list: vi.fn().mockResolvedValue({ records: [{ ...record(), items: undefined, itemCount: 1, totalQuantity: 2, productIds: [PRODUCT] }], totalCount: 1 }), listFavoriteProductIds: vi.fn().mockResolvedValue([PRODUCT]), setFavorite: vi.fn().mockResolvedValue({ saved: true, listId: LIST }), findById: vi.fn().mockResolvedValue(record()), create: vi.fn().mockResolvedValue(record()), updateMetadata: vi.fn().mockResolvedValue(record()), mergeItems: vi.fn().mockResolvedValue(record()), updateItems: vi.fn().mockResolvedValue(record()), removeItems: vi.fn().mockResolvedValue(record()), setArchived: vi.fn().mockResolvedValue(record()), duplicate: vi.fn().mockResolvedValue(record()), mergeIntoCart: vi.fn().mockResolvedValue({ cartId: "99999999-9999-4999-8999-999999999999", repeated: false }) };
    catalog = { listCategories: vi.fn(), listBrands: vi.fn(), listProducts: vi.fn(), getProductDetailBySlug: vi.fn(), getProductsByIds: vi.fn().mockResolvedValue([product()]), getProductOrderIdentities: vi.fn() };
    pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([commercial()]) };
    cart = { getCart: vi.fn(), getCheckoutIntent: vi.fn(), getItemCount: vi.fn(), addItem: vi.fn(), addItems: vi.fn(), updateQuantity: vi.fn(), removeItem: vi.fn(), mergeEstimateProducts: vi.fn(), getEstimateSource: vi.fn().mockResolvedValue({ companyId: COMPANY, cartId: ORDER, lines: [{ productId: PRODUCT, sku: "400691", productName: "Camera", quantity: 2, partnerPrice: 10, currencyCode: "USD", priceUpdatedAt: "2026-07-20T00:00:00Z" }] }) };
    history = { getReorderSource: vi.fn().mockResolvedValue(orderSource()), listVisible: vi.fn(), findVisibleById: vi.fn(), listItemsByOrderIds: vi.fn(), listEvents: vi.fn(), getSyncState: vi.fn(), startSync: vi.fn(), upsertBatch: vi.fn(), completeSync: vi.fn(), failSync: vi.fn() };
    estimate = { createFromPurchasingList: vi.fn().mockResolvedValue({ estimateId: ORDER, repeated: false, added: 1, skipped: 0 }) };
    service = new PurchasingListService(repository, companyAccess as never, permission as never, catalog, pricing, cart, history, estimate);
  });

  afterEach(() => vi.useRealTimers());

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

  it("saves a Live Commerce selection as a private purchasing list without price or stock snapshots", async () => {
    const result = await service.createFromLiveCommerceSelection(USER, { name: "  CCTV kit  ", items: [{ productId: PRODUCT, quantity: 7 }] });
    expect(repository.create).toHaveBeenCalledWith({
      companyId: COMPANY,
      name: "CCTV kit",
      description: null,
      visibility: "private",
      sourceType: "manual",
      sourceReferenceId: null,
      items: [{ productId: PRODUCT, quantity: 7 }],
    });
    expect(JSON.stringify(vi.mocked(repository.create).mock.calls[0]?.[0])).not.toMatch(/price|stock/i);
    expect(result).toMatchObject({ saved: 1, skipped: 0 });
  });

  it("validates the only required user input: kit name", async () => {
    await expect(service.createFromLiveCommerceSelection(USER, { name: "   ", items: [{ productId: PRODUCT, quantity: 2 }] })).rejects.toThrow(/list name/i);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("partially saves only current catalog products and rejects duplicate input", async () => {
    const missingProduct = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result = await service.createFromLiveCommerceSelection(USER, { name: "Partial", items: [{ productId: PRODUCT, quantity: 2 }, { productId: missingProduct, quantity: 3 }] });
    expect(result).toMatchObject({ saved: 1, skipped: 1 });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ items: [{ productId: PRODUCT, quantity: 2 }] }));
    await expect(service.createFromLiveCommerceSelection(USER, { name: "Duplicate", items: [{ productId: PRODUCT, quantity: 1 }, { productId: PRODUCT, quantity: 2 }] })).rejects.toThrow(/more than once/);
  });

  it("loads bounded kit summaries without eager product, price, or stock reads", async () => {
    const result = await service.listLiveCommerceKits(USER);
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, limit: 4, archived: false }));
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ id: LIST, itemCount: 1, totalQuantity: 2 });
  });

  it("lazily resolves current partner price and stock in one batch and never returns historical price", async () => {
    vi.mocked(repository.findById).mockResolvedValue(record({ items: [{ ...record().items[0], sourceUnitPrice: 3, sourceCurrencyCode: "USD" }] }));
    const result = await service.getLiveCommerceKit(USER, LIST);
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(result.lines[0]).toMatchObject({ status: "READY", currentPrice: "$10.00", currentStock: 5, quantity: 2 });
    expect(JSON.stringify(result)).not.toContain("sourceUnitPrice");
    expect(JSON.stringify(result)).not.toContain("currentRetailPrice");
  });

  it.each([
    ["PRODUCT_INACTIVE", [], [commercial()]],
    ["PRICE_UNAVAILABLE", [product()], [{ ...commercial(), partnerPrice: null }]],
    ["UNAVAILABLE", [product()], [{ ...commercial(), stock: { ...commercial().stock, exactAvailableQuantity: 0 } }]],
  ] as const)("classifies %s kit lines for problem-first partial handling", async (status, products, commercialViews) => {
    vi.mocked(catalog.getProductsByIds).mockResolvedValue(products as never);
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue(commercialViews as never);
    const result = await service.getLiveCommerceKit(USER, LIST);
    expect(result.lines[0].status).toBe(status);
    expect(result).toMatchObject({ readyCount: 0, attentionCount: 1 });
  });

  it("keeps a partially ready kit usable and orders its issue first", async () => {
    const secondItem = { ...record().items[0], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", position: 2 };
    vi.mocked(repository.findById).mockResolvedValue(record({ items: [record().items[0], secondItem] }));
    vi.mocked(catalog.getProductsByIds).mockResolvedValue([product(), { ...product(), id: secondItem.productId, sku: "400692" }]);
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([commercial(), { ...commercial(), productId: secondItem.productId, partnerPrice: null }]);
    const result = await service.getLiveCommerceKit(USER, LIST);
    expect(result).toMatchObject({ readyCount: 1, attentionCount: 1 });
    expect(result.lines.map((line) => line.status)).toEqual(["PRICE_UNAVAILABLE", "READY"]);
  });

  it("re-resolves authoritative commercial truth once and prepares one selection batch", async () => {
    const authoritative = vi.fn().mockResolvedValue([commercial()]);
    pricing.getAuthoritativeProductCommercialViews = authoritative;
    const result = await service.prepareLiveCommerceKitSelection(USER, { listId: LIST, items: [{ itemId: ITEM, quantity: 8 }] });
    expect(authoritative).toHaveBeenCalledOnce();
    expect(authoritative).toHaveBeenCalledWith(USER, [PRODUCT]);
    expect(result).toMatchObject({ readyCount: 1, attentionCount: 0 });
    expect(result.items[0]).toMatchObject({ product: { id: PRODUCT, partnerPrice: { amount: 10 }, stock: { exactAvailableQuantity: 5 } }, quantity: 8 });
  });

  it("preserves a non-empty client selection contract by returning additive items only", async () => {
    const result = await service.prepareLiveCommerceKitSelection(USER, { listId: LIST, items: [{ itemId: ITEM, quantity: 2 }] });
    expect(result.items).toEqual([expect.objectContaining({ product: expect.objectContaining({ id: PRODUCT }), quantity: 2 })]);
    expect(result).not.toHaveProperty("replace");
    expect(result).not.toHaveProperty("clear");
  });

  it("deliberately updates all kit quantities in one revision-bound mutation without commercial reads", async () => {
    const result = await service.updateLiveCommerceKit(USER, { listId: LIST, expectedRevision: 1, items: [{ itemId: ITEM, quantity: 9 }] });
    expect(repository.updateItems).toHaveBeenCalledOnce();
    expect(repository.updateItems).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, items: [expect.objectContaining({ itemId: ITEM, quantity: 9 })] }));
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
    expect(result.id).toBe(LIST);
  });

  it("denies a cross-company kit before product or commercial resolution", async () => {
    vi.mocked(repository.findById).mockResolvedValue(record({ companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
    await expect(service.getLiveCommerceKit(USER, LIST)).rejects.toBeInstanceOf(NotFoundError);
    expect(catalog.getProductsByIds).not.toHaveBeenCalled();
    expect(pricing.getProductCommercialViews).not.toHaveBeenCalled();
  });

  it("enforces Purchasing List and catalog permissions for kit reads and writes", async () => {
    await service.listLiveCommerceKits(USER);
    expect(permission.ensurePermission).toHaveBeenCalledWith(USER, COMPANY, "purchasing_lists.view");
    expect(permission.ensurePermission).toHaveBeenCalledWith(USER, COMPANY, "catalog.view");
    permission.ensurePermission.mockClear();
    await service.createFromLiveCommerceSelection(USER, { name: "Secure kit", items: [{ productId: PRODUCT, quantity: 1 }] });
    expect(permission.ensurePermission).toHaveBeenCalledWith(USER, COMPANY, "purchasing_lists.manage");
    expect(permission.ensurePermission).toHaveBeenCalledWith(USER, COMPANY, "catalog.view");
  });

  it("keeps deletion explicit by reusing exact-ID archive semantics", async () => {
    await service.setArchived(USER, LIST, 1, true);
    expect(repository.setArchived).toHaveBeenCalledWith({ listId: LIST, expectedRevision: 1, archived: true });
  });

  it.each(["increase", "replace", "keep"] as const)("uses explicit %s duplicate behavior", async (mergeMode) => {
    await service.addProduct(USER, { listId: LIST, productId: PRODUCT, quantity: 2, mergeMode });
    expect(repository.mergeItems).toHaveBeenCalledWith(expect.objectContaining({ mergeMode }));
  });

  it("updates quantities and ordering in one bounded repository call", async () => {
    await service.updateItems(USER, LIST, 1, [{ itemId: ITEM, quantity: 5, position: 1 }]);
    expect(repository.updateItems).toHaveBeenCalledOnce();
  });

  it("returns one stable conflict without retrying a concurrent update", async () => { vi.mocked(repository.updateItems).mockRejectedValue(new PurchasingListRepositoryError("PT409")); await expect(service.updateItems(USER, LIST, 1, [{ itemId: ITEM, quantity: 5, position: 1 }])).rejects.toMatchObject({ code: "PURCHASING_LIST_CONFLICT" }); expect(repository.updateItems).toHaveBeenCalledOnce(); });
  it("duplicates without changing the source", async () => { await service.duplicate(USER, LIST); expect(repository.duplicate).toHaveBeenCalledOnce(); expect(repository.updateMetadata).not.toHaveBeenCalled(); });

  it("loads index commercial data once for all products", async () => { await service.list(USER); expect(catalog.getProductsByIds).toHaveBeenCalledOnce(); expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce(); });
  it("loads manageable catalog dialog choices without commercial projections", async () => { await service.listManageableChoices(USER); expect(repository.list).toHaveBeenCalledOnce(); expect(catalog.getProductsByIds).not.toHaveBeenCalled(); expect(pricing.getProductCommercialViews).not.toHaveBeenCalled(); });
  it("loads detail product and commercial data in bulk", async () => { await service.getDetail(USER, LIST); expect(catalog.getProductsByIds).toHaveBeenCalledOnce(); expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce(); });
  it("loads favorite membership through one bounded repository call", async () => { const result = await service.listFavoriteProductIds(USER, [PRODUCT, PRODUCT]); expect(result).toEqual([PRODUCT]); expect(repository.listFavoriteProductIds).toHaveBeenCalledWith(COMPANY, [PRODUCT]); });
  it("toggles a favorite only after validating current catalog visibility", async () => { await service.setFavorite(USER, PRODUCT, true); expect(catalog.getProductsByIds).toHaveBeenCalledWith(USER, [PRODUCT]); expect(repository.setFavorite).toHaveBeenCalledWith(COMPANY, PRODUCT, true); });

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
  it("does not rename or archive the protected favorites list", async () => { vi.mocked(repository.findById).mockResolvedValue(record({ isSystemFavorites: true })); await expect(service.updateMetadata(USER, LIST, 1, { name: "Other", visibility: "private" })).rejects.toThrow(); await expect(service.setArchived(USER, LIST, 1, true)).rejects.toThrow(); });
  it("allows quantity management inside the protected favorites list", async () => { vi.mocked(repository.findById).mockResolvedValue(record({ isSystemFavorites: true })); await service.updateItems(USER, LIST, 1, [{ itemId: ITEM, quantity: 3, position: 1 }]); expect(repository.updateItems).toHaveBeenCalledOnce(); });
});

function record(overrides: Partial<PurchasingListRecord> = {}): PurchasingListRecord { return { id: LIST, companyId: COMPANY, name: "Install kit", description: null, visibility: "private", createdBy: USER, updatedBy: USER, revision: 1, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z", archivedAt: null, isSystemFavorites: false, ownerName: "Partner", items: [{ id: ITEM, listId: LIST, productId: PRODUCT, quantity: 2, position: 1, note: null, sourceType: "manual", sourceReferenceId: null, sourceUnitPrice: null, sourceCurrencyCode: null, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z" }], ...overrides }; }
function product() { return { id: PRODUCT, sku: "400691", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }; }
function commercial() { return { productId: PRODUCT, partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00", lastUpdatedAt: "2026-07-20T00:00:00Z" }, retailPrice: null, stock: { status: "in_stock" as const, label: "В наличии", exactAvailableQuantity: 5, exactPhysicalQuantity: 5, exactReservedQuantity: 0, exactIncomingQuantity: 0, expectedArrival: null, hasVariantStock: false, lastUpdatedAt: "2026-07-20T00:00:00Z" }, isDemoData: false, retailBelowPartnerPrice: false }; }
function orderSource() { return { orderId: ORDER, companyId: COMPANY, orderNumber: "NS-1", orderCurrencyCode: "USD", lines: [{ lineId: LINE, lineNumber: 1, productId: PRODUCT, historicalExternalProductRef: "x", historicalProductName: "Camera", historicalSku: "400691", historicalQuantity: 2, historicalUnitPrice: 9, historicalCurrencyCode: "USD", productExists: true, currentExternalProductRef: "x", currentName: "Camera", currentSku: "400691", currentSlug: "camera", currentImageUrl: null, currentCategoryId: null, currentIsActive: true, currentIsVisible: true }, { lineId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", lineNumber: 2, productId: null, historicalExternalProductRef: "service", historicalProductName: "Delivery", historicalSku: null, historicalQuantity: 1, historicalUnitPrice: 5, historicalCurrencyCode: "USD", productExists: false, currentExternalProductRef: null, currentName: null, currentSku: null, currentSlug: null, currentImageUrl: null, currentCategoryId: null, currentIsActive: false, currentIsVisible: false }] }; }
