import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogService } from "../../../catalog/services";
import type { CartService } from "../../../orders/services";
import type { PartnerOrderHistoryRepository } from "../../../orders/repositories";
import type { PricingInventoryService } from "../../../pricing-inventory/services";
import type { PurchasingListService } from "../../../purchasing-lists/services";
import { PurchaseTemplateRepositoryError, type PurchaseTemplateRecord, type PurchaseTemplateRepository } from "../../repositories";
import { PurchaseTemplateService } from "../purchase-template.service";

const USER = "11111111-1111-4111-8111-111111111111";
const COMPANY = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const PRODUCT = "55555555-5555-4555-8555-555555555555";
const ORDER = "66666666-6666-4666-8666-666666666666";
const LIST = "77777777-7777-4777-8777-777777777777";
const REQUEST = "88888888-8888-4888-8888-888888888888";

describe("PurchaseTemplateService", () => {
  let repository: PurchaseTemplateRepository;
  let catalog: CatalogService;
  let pricing: PricingInventoryService;
  let cart: CartService;
  let history: PartnerOrderHistoryRepository;
  let purchasingLists: PurchasingListService;
  let service: PurchaseTemplateService;
  const companyAccess = { getOwnMemberships: vi.fn(), getActiveCompanyContext: vi.fn() };
  const permission = { ensurePermission: vi.fn(), hasPermission: vi.fn() };

  beforeEach(() => {
    companyAccess.getOwnMemberships.mockResolvedValue([{ companyId: COMPANY, status: "active" }]);
    companyAccess.getActiveCompanyContext.mockResolvedValue({ company: { id: COMPANY } });
    permission.ensurePermission.mockResolvedValue(undefined);
    permission.hasPermission.mockResolvedValue(true);
    repository = {
      list: vi.fn().mockResolvedValue({ records: [{ ...withoutItems(record()), ownerName: "Partner", itemCount: 1, totalQuantity: 2, productIds: [PRODUCT], itemIntents: [{ productId: PRODUCT, quantity: 2 }] }], totalCount: 1 }),
      findById: vi.fn().mockResolvedValue(record()),
      create: vi.fn().mockImplementation(async (input) => ({ ...withoutItems(record()), name: input.name, visibility: input.visibility, sourceType: input.sourceType, sourceId: input.sourceId })),
      update: vi.fn().mockResolvedValue({ ...withoutItems(record()), revision: 2 }),
      archive: vi.fn().mockResolvedValue({ ...withoutItems(record()), status: "archived", archivedAt: "2026-07-31T12:00:00Z" }),
      copy: vi.fn().mockResolvedValue(withoutItems(record())),
      mergeIntoCart: vi.fn().mockResolvedValue({ cartId: ORDER, repeated: false }),
    };
    catalog = { listCategories: vi.fn(), listBrands: vi.fn(), listProducts: vi.fn(), getProductDetailBySlug: vi.fn(), getProductsByIds: vi.fn().mockResolvedValue([product()]), getProductOrderIdentities: vi.fn() };
    pricing = { getCommercialVisibility: vi.fn().mockResolvedValue({ mode: "full", canViewPartnerTotals: true }), getProductCommercialViews: vi.fn().mockResolvedValue([commercial()]) } as unknown as PricingInventoryService;
    cart = { getCart: vi.fn(), getCheckoutIntent: vi.fn(), getItemCount: vi.fn(), addItem: vi.fn(), addItems: vi.fn(), updateQuantity: vi.fn(), removeItem: vi.fn(), mergeEstimateProducts: vi.fn(), getEstimateSource: vi.fn().mockResolvedValue({ companyId: COMPANY, cartId: ORDER, lines: [{ productId: PRODUCT, sku: "400691", productName: "Camera", quantity: 2, partnerPrice: 10, currencyCode: "USD", priceUpdatedAt: "2026-07-31T00:00:00Z" }] }) };
    history = { getReorderSource: vi.fn().mockResolvedValue(orderSource()), listVisible: vi.fn(), findVisibleById: vi.fn(), listItemsByOrderIds: vi.fn(), listEvents: vi.fn(), getSyncState: vi.fn(), startSync: vi.fn(), upsertBatch: vi.fn(), completeSync: vi.fn(), failSync: vi.fn() };
    purchasingLists = { getDetail: vi.fn().mockResolvedValue({ id: LIST, lines: [{ productId: PRODUCT, quantity: 3, note: "Install" }] }) } as unknown as PurchasingListService;
    service = new PurchaseTemplateService(repository, companyAccess as never, permission as never, catalog, pricing, cart, history, purchasingLists);
  });

  it.each(["private", "company"] as const)("creates a %s template in the server-derived company", async (visibility) => {
    await service.createManual(USER, { name: "  Monthly stock  ", visibility, requestKey: REQUEST });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, name: "Monthly stock", visibility, items: [] }));
  });

  it("creates from cart without storing historical commercial truth or changing the cart", async () => {
    await service.createFromCart(USER, { name: "Cart", visibility: "private", requestKey: REQUEST });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "cart", items: [expect.not.objectContaining({ price: expect.anything(), stock: expect.anything() })] }));
    expect(cart.removeItem).not.toHaveBeenCalled();
  });

  it("creates from a visible order and deterministically collapses duplicate products", async () => {
    const source = orderSource(); source.lines.push({ ...source.lines[0], lineId: "99999999-9999-4999-8999-999999999999", historicalQuantity: 3 });
    vi.mocked(history.getReorderSource).mockResolvedValue(source);
    await service.createFromOrder(USER, { orderId: ORDER, name: "Order", visibility: "company", requestKey: REQUEST });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ productId: PRODUCT, preferredQuantity: 5 })] }));
  });

  it("creates from a purchasing list while preserving quantity and note", async () => {
    await service.createFromPurchasingList(USER, { listId: LIST, name: "List", visibility: "private", requestKey: REQUEST });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "purchasing_list", items: [expect.objectContaining({ preferredQuantity: 3, lineNote: "Install" })] }));
  });

  it("creates a bounded dashboard-reorder template from current product identities", async () => {
    await service.createFromDashboardReorder(USER, { requestKey: REQUEST, items: [{ productId: PRODUCT, quantity: 2 }] });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "dashboard_reorder", name: "Вы покупали ранее", items: [expect.objectContaining({ productId: PRODUCT, preferredQuantity: 2 })] }));
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
  });

  it("returns one stable conflict without retrying a concurrent update", async () => { vi.mocked(repository.update).mockRejectedValue(new PurchaseTemplateRepositoryError("PT409")); await expect(service.update(USER, { templateId: TEMPLATE, expectedRevision: 1, name: "Changed", visibility: "private", items: [] })).rejects.toMatchObject({ code: "PURCHASE_TEMPLATE_CONFLICT" }); expect(repository.update).toHaveBeenCalledOnce(); });

  it("loads current product and commercial truth once for the whole detail", async () => {
    const detail = await service.getDetail(USER, TEMPLATE);
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(detail.lines[0]).toMatchObject({ state: "available", currentUnitPriceAmount: 10, availableQuantity: 10 });
  });

  it("loads list warnings and totals with one batched commercial projection", async () => {
    const page = await service.list(USER);
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(page.records[0].totals[0]).toMatchObject({ currencyCode: "USD", amount: 20 });
  });

  it("uses RETAIL-safe pricing without leaking partner price", async () => {
    vi.mocked(pricing.getCommercialVisibility!).mockResolvedValue({ mode: "retail_only", canViewPartnerTotals: false } as never);
    const detail = await service.getDetail(USER, TEMPLATE);
    expect(detail.lines[0]).toMatchObject({ currentUnitPriceAmount: 25, currentCurrencyCode: "MDL" });
    expect(JSON.stringify(detail)).not.toContain("$10.00");
  });

  it.each([
    [0, null, "unavailable"],
    [0, { expectedDate: "2026-08-05", expectedQuantity: 5, formattedExpectedDate: "05.08.2026", sourceStatus: "confirmed_supply" }, "expected"],
    [1, null, "quantity_exceeds_available"],
  ] as const)("classifies current stock %s as %s", async (available, arrival, expected) => {
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{ ...commercial(), stock: { ...commercial().stock!, exactAvailableQuantity: available, expectedArrival: arrival } }]);
    expect((await service.getDetail(USER, TEMPLATE)).lines[0].state).toBe(expected);
  });

  it("keeps unpublished intent visible without exposing stale identity", async () => {
    vi.mocked(catalog.getProductsByIds).mockResolvedValue([]);
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([]);
    expect((await service.getDetail(USER, TEMPLATE)).lines[0]).toMatchObject({ state: "unpublished", productName: null, eligible: false });
  });

  it("adds only eligible lines through one idempotent cart mutation", async () => {
    const result = await service.addToCart(USER, { templateId: TEMPLATE, requestKey: REQUEST, multiplier: 2 });
    expect(repository.mergeIntoCart).toHaveBeenCalledOnce();
    expect(repository.mergeIntoCart).toHaveBeenCalledWith(expect.objectContaining({ items: [{ itemId: ITEM, productId: PRODUCT, quantity: 4 }] }));
    expect(result.added).toBe(1);
  });

  it("returns a repeated execution without issuing another service mutation", async () => {
    vi.mocked(repository.mergeIntoCart).mockResolvedValue({ cartId: ORDER, repeated: true });
    expect((await service.addToCart(USER, { templateId: TEMPLATE, requestKey: REQUEST, multiplier: 1 })).repeated).toBe(true);
  });

  it("skips unavailable lines and never creates an order", async () => {
    vi.mocked(pricing.getProductCommercialViews).mockResolvedValue([{ ...commercial(), stock: { ...commercial().stock!, exactAvailableQuantity: 0 } }]);
    const result = await service.addToCart(USER, { templateId: TEMPLATE, requestKey: REQUEST, multiplier: 1 });
    expect(result.unavailable).toBe(1); expect(repository.mergeIntoCart).not.toHaveBeenCalled(); expect(history.upsertBatch).not.toHaveBeenCalled();
  });

  it("accepts half multiplier only when resulting quantities remain integral", async () => {
    await service.addToCart(USER, { templateId: TEMPLATE, requestKey: REQUEST, multiplier: 0.5 });
    expect(repository.mergeIntoCart).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ quantity: 1 })] }));
    vi.mocked(repository.findById).mockResolvedValue(record({ items: [{ ...record().items[0], preferredQuantity: 1 }] }));
    await expect(service.addToCart(USER, { templateId: TEMPLATE, requestKey: REQUEST, multiplier: 0.5 })).rejects.toThrow();
  });

  it("rejects cross-company access and invalid quantities", async () => {
    vi.mocked(repository.findById).mockResolvedValue(record({ companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
    await expect(service.getDetail(USER, TEMPLATE)).rejects.toThrow();
    await expect(service.update(USER, { templateId: TEMPLATE, expectedRevision: 1, name: "x", visibility: "private", items: [{ productId: PRODUCT, preferredQuantity: 0, lineNote: null, sortOrder: 1 }] })).rejects.toThrow();
  });
});

function record(overrides: Partial<PurchaseTemplateRecord> = {}): PurchaseTemplateRecord { return { id: TEMPLATE, companyId: COMPANY, ownerUserId: USER, name: "Monthly", description: null, visibility: "private", status: "active", sourceType: "manual", sourceId: null, usageCount: 0, lastUsedAt: null, revision: 1, createdAt: "2026-07-31T00:00:00Z", updatedAt: "2026-07-31T00:00:00Z", archivedAt: null, ownerName: "Partner", items: [{ id: ITEM, templateId: TEMPLATE, productId: PRODUCT, preferredQuantity: 2, lineNote: null, sortOrder: 1, createdAt: "2026-07-31T00:00:00Z", updatedAt: "2026-07-31T00:00:00Z" }], ...overrides }; }
function withoutItems(value: PurchaseTemplateRecord) { const { items, ownerName, ...template } = value; void items; void ownerName; return template; }
function product() { return { id: PRODUCT, sku: "400691", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }; }
function commercial() { return { productId: PRODUCT, partnerPrice: { amount: 10, currencyCode: "USD", formattedAmount: "$10.00", lastUpdatedAt: "2026-07-31T00:00:00Z" }, retailPrice: { amount: 25, currencyCode: "MDL", formattedAmount: "25,00 MDL", lastUpdatedAt: "2026-07-31T00:00:00Z" }, stock: { status: "in_stock" as const, label: "В наличии", exactAvailableQuantity: 10, exactPhysicalQuantity: 10, exactReservedQuantity: 0, exactIncomingQuantity: 0, expectedArrival: null, hasVariantStock: false, lastUpdatedAt: "2026-07-31T00:00:00Z" }, isDemoData: false, retailBelowPartnerPrice: false }; }
function orderSource() { return { orderId: ORDER, companyId: COMPANY, orderNumber: "NS-1", orderCurrencyCode: "USD", lines: [{ lineId: ITEM, lineNumber: 1, productId: PRODUCT, historicalExternalProductRef: "x", historicalProductName: "Camera", historicalSku: "400691", historicalQuantity: 2, historicalUnitPrice: 8, historicalCurrencyCode: "USD", productExists: true, currentExternalProductRef: "x", currentName: "Camera", currentSku: "400691", currentSlug: "camera", currentImageUrl: null, currentCategoryId: null, currentIsActive: true, currentIsVisible: true }] }; }
