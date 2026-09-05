import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import { NotFoundError } from "../../../access-control/services";
import type { ProductReferenceService } from "../../../catalog/services";
import type { OrderProvider } from "../../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type { PartnerOrderHistoryRepository, PartnerOrderRepository } from "../../repositories";
import {
  PartnerOrderIntegrationStatus,
  PartnerOrderStatus,
  type PartnerOrderHistory,
} from "../../types";
import { DefaultPartnerOrderHistoryService } from "../order-history.service";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";

describe("DefaultPartnerOrderHistoryService", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["open", "Подтверждён"],
    ["preorder", "Готовится к отгрузке"],
    ["test", "Требует уточнения"],
    ["completed", "Отгружен"],
  ] as const)("renders the exact mapped 1C state %s", async (state, label) => {
    const repository = historyRepository([history({ oneCStateCode: state })]);
    const result = await service(repository).list("user-1", {});
    expect(result.orders[0]?.statusLabel).toBe(label);
  });

  it("shows an unposted order as processing without exposing its internal NSUU number", async () => {
    const repository = historyRepository([history({ oneCPosted: false, external1cOrderNumber: "NSUU-PRIVATE" })]);
    const result = await service(repository).list("user-1", {});
    expect(result.orders[0]).toMatchObject({ primaryLabel: "Заказ обрабатывается", statusLabel: "Обрабатывается" });
    expect(JSON.stringify(result.orders[0])).not.toContain("NSUU-PRIVATE");
  });

  it("shows a neutral fallback for an unknown posted 1C state", async () => {
    const repository = historyRepository([history({ oneCStateCode: null, oneCStateRaw: "unknown-guid" })]);
    const result = await service(repository).list("user-1", {});
    expect(result.orders[0]?.statusLabel).toBe("Статус уточняется");
  });

  it("omits historical partner totals and line prices for retail-only users", async () => {
    const record = history({ documentTotal: 1234.56, currencyCode: "USD" });
    const repository = historyRepository([record]);
    repository.listItemsByOrderIds.mockResolvedValue([{
      id: "item-1",
      orderHistoryId: record.id,
      externalProductRef: "product-ref",
      productId: null,
      productName: "Camera",
      sku: "400123",
      quantity: 2,
      unitPrice: 123.45,
      lineTotal: 246.9,
      currencyCode: "USD",
      lineNumber: 1,
      createdAt: "2026-07-20T00:00:00Z",
      updatedAt: "2026-07-20T00:00:00Z",
    }]);

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.retail_price.view"],
    ).get("user-1", record.id);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("documentTotal");
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("lineTotal");
    expect(serialized).not.toContain("1234.56");
    expect(serialized).not.toContain("123.45");
  });

  it("enriches mapped order lines once and leaves unmapped lines explicit", async () => {
    const record = history();
    const repository = historyRepository([record]);
    repository.listItemsByOrderIds.mockResolvedValue([
      historyLine(record.id, "item-1", "product-1", "400123"),
      historyLine(record.id, "item-2", null, "LEGACY-1"),
    ]);
    const productReferences = {
      getProductReferencesByIds: vi.fn().mockResolvedValue([{
        productId: "product-1",
        slug: "camera",
        sku: "400123",
        name: "Camera",
        thumbnail: "/products/camera.jpg",
        thumbnailFit: "contain",
        publicationState: "published",
      }]),
    };

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.partner_price.view"],
      undefined,
      productReferences as unknown as ProductReferenceService,
    ).get("user-1", record.id);

    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledOnce();
    expect(productReferences.getProductReferencesByIds).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(result.lines[0]?.product?.thumbnail).toBe("/products/camera.jpg");
    expect(result.lines[1]?.product).toBeNull();
  });

  it("loads historical detail, products, documents, and bounded history through one aggregate", async () => {
    const record = history();
    const getDetailAggregate = vi.fn().mockResolvedValue({
      order: record,
      companyName: "ALERT-SS SRL",
      canViewPartnerPrice: true,
      items: [historyLine(record.id, "item-1", "product-1", "400123")],
      events: [],
      portalSnapshot: null,
      productReferences: [{
        productId: "product-1",
        slug: "camera",
        sku: "400123",
        name: "Camera",
        thumbnail: "/products/camera.jpg",
        thumbnailFit: "contain",
        publicationState: "published",
      }],
      documents: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        documentType: "invoice",
        title: "Invoice",
        documentNumber: "INV-1",
        issueDate: "2026-07-15",
        validFrom: null,
        validUntil: null,
        status: "available",
        version: "1",
        languageCode: "ru",
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
        fileSize: 100,
        isCurrent: true,
        sourceScope: "company_specific",
        products: [],
        orders: [{ id: record.id, number: record.external1cOrderNumber }],
      }],
    });
    const repository = { ...historyRepository([]), getDetailAggregate };
    const productReferences = { getProductReferencesByIds: vi.fn() };

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.partner_price.view"],
      undefined,
      productReferences as unknown as ProductReferenceService,
    ).get("user-1", record.id);

    expect(getDetailAggregate).toHaveBeenCalledOnce();
    expect(repository.findVisibleById).not.toHaveBeenCalled();
    expect(repository.listItemsByOrderIds).not.toHaveBeenCalled();
    expect(repository.listEvents).not.toHaveBeenCalled();
    expect(productReferences.getProductReferencesByIds).not.toHaveBeenCalled();
    expect(result.lines[0]?.product?.slug).toBe("camera");
    expect(result.documents).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(record.external1cOrderRef);
  });

  it("returns safe not-found while the deleted audit record remains in the repository", async () => {
    const deleted = history({ partnerVisible: false, oneCDeletionMark: true, hiddenReason: "deleted_in_1c" });
    const repository = historyRepository([], deleted);
    await expect(service(repository).get("user-1", deleted.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.auditRecord).toBe(deleted);
  });

  it("renders a confirmed portal receipt before the 1C history sync links it", async () => {
    const portalRepository = {
      findById: vi.fn().mockResolvedValue({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        companyId: COMPANY_ID,
        status: PartnerOrderStatus.Submitted,
        integrationStatus: PartnerOrderIntegrationStatus.Confirmed,
        external1cNumber: "NSUU-002027",
        external1cDate: "2026-07-29T11:40:03Z",
        requestedDeliveryDate: "2026-07-31",
        documentTotal: 324.5,
        currencyCode: "USD",
        confirmedAt: "2026-07-29T11:40:04Z",
        submittedAt: "2026-07-29T11:40:04Z",
        updatedAt: "2026-07-29T11:40:04Z",
      }),
      listItems: vi.fn().mockResolvedValue([{
        productName: "DHL43-F600",
        sku: "900005",
        quantity: 1,
        partnerUnitPrice: 324.5,
        lineTotal: 324.5,
        currencyCode: "USD",
      }]),
    } as unknown as PartnerOrderRepository;

    const result = await service(
      historyRepository([]),
      orderProvider(),
      ["pricing.partner_price.view"],
      portalRepository,
    ).get("user-1", "cccccccc-cccc-4ccc-8ccc-cccccccccccc");

    expect(result).toMatchObject({
      primaryLabel: "№ NSUU-002027",
      statusLabel: "Обрабатывается",
      deliveryDate: "2026-07-31",
      documentTotal: "324,50 $",
      positionCount: 1,
      totalUnitCount: 1,
      lines: [{ sku: "900005", quantity: 1 }],
    });
  });

  it("returns the canonical history identity when a linked portal order id is opened", async () => {
    const portalOrder = confirmedPortalOrder();
    const synchronized = history({ portalOrderId: portalOrder.id });
    const repository = historyRepository([]);
    repository.findVisibleById.mockResolvedValue(synchronized);

    const result = await service(repository).get("user-1", portalOrder.id);

    expect(repository.findVisibleById).toHaveBeenCalledWith(portalOrder.id);
    expect(result.id).toBe(synchronized.id);
  });

  it("lists a confirmed portal order immediately without waiting for history sync", async () => {
    const portalOrder = confirmedPortalOrder();
    const portalRepository = {
      listByCompanyId: vi.fn().mockResolvedValue([portalOrder]),
      findById: vi.fn().mockResolvedValue(null),
      listItems: vi.fn().mockResolvedValue([]),
    } as unknown as PartnerOrderRepository;

    const result = await service(
      historyRepository([]),
      orderProvider(),
      ["pricing.partner_price.view"],
      portalRepository,
    ).list("user-1", {});

    expect(result).toMatchObject({
      total: 1,
      orders: [{
        id: portalOrder.id,
        primaryLabel: "№ NSUU-002027",
        statusLabel: "Обрабатывается",
        positionCount: 1,
        totalUnitCount: 2,
      }],
    });
  });

  it("merges a confirmed portal order when the synchronized 1C identity exists", async () => {
    const portalOrder = confirmedPortalOrder();
    const synchronized = history({
      portalOrderId: portalOrder.id,
      external1cOrderRef: portalOrder.external1cRef!,
    });
    const repository = historyRepository([synchronized]);
    repository.listMergeIdentities = vi.fn().mockResolvedValue([{
      external1cOrderRef: synchronized.external1cOrderRef,
      portalOrderId: portalOrder.id,
    }]);
    const portalRepository = {
      listByCompanyId: vi.fn().mockResolvedValue([portalOrder]),
      findById: vi.fn().mockResolvedValue(null),
      listItems: vi.fn().mockResolvedValue([]),
    } as unknown as PartnerOrderRepository;

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.partner_price.view"],
      portalRepository,
    ).list("user-1", {});

    expect(result.total).toBe(1);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.id).toBe(synchronized.id);
    expect(repository.listMergeIdentities).toHaveBeenCalledWith(COMPANY_ID, {
      external1cRefs: [portalOrder.external1cRef],
      portalOrderIds: [portalOrder.id],
    });
  });

  it("does not resurrect a confirmed portal order after its linked 1C identity is hidden", async () => {
    const portalOrder = confirmedPortalOrder();
    const repository = historyRepository([]);
    repository.listMergeIdentities = vi.fn().mockResolvedValue([{
      external1cOrderRef: portalOrder.external1cRef!,
      portalOrderId: portalOrder.id,
    }]);
    const portalRepository = {
      listConfirmedByCompanyId: vi.fn().mockResolvedValue([portalOrder]),
    } as unknown as PartnerOrderRepository;

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.partner_price.view"],
      portalRepository,
    ).list("user-1", {});

    expect(result.orders).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("keeps an existing ref visible when a different ref with the same order number is hidden", async () => {
    const hiddenPortalOrder = confirmedPortalOrder();
    const visibleHistory = history({
      id: "abababab-abab-4bab-8bab-abababababab",
      external1cOrderRef: "12121212-1212-4212-8212-121212121212",
      external1cOrderNumber: hiddenPortalOrder.external1cNumber!,
    });
    const repository = historyRepository([visibleHistory]);
    repository.listMergeIdentities = vi.fn().mockResolvedValue([{
      external1cOrderRef: hiddenPortalOrder.external1cRef!,
      portalOrderId: hiddenPortalOrder.id,
    }]);
    const portalRepository = {
      listConfirmedByCompanyId: vi.fn().mockResolvedValue([hiddenPortalOrder]),
    } as unknown as PartnerOrderRepository;

    const result = await service(
      repository,
      orderProvider(),
      ["pricing.partner_price.view"],
      portalRepository,
    ).list("user-1", {});

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]?.id).toBe(visibleHistory.id);
  });

  it("imports more than 100 orders through continuation pages", async () => {
    const repository = historyRepository([]);
    const first = Array.from({ length: 100 }, (_, index) => historyDto(index));
    const second = [historyDto(100)];
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage(first, "100"))
      .mockResolvedValueOnce(historyPage(second, null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(result.received).toBe(101);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(repository.upsertBatch).toHaveBeenCalledTimes(2);
  });

  it("marks a failed partial sync without removing the successful earlier batch", async () => {
    const repository = historyRepository([]);
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage([historyDto(1)], "100"))
      .mockRejectedValueOnce(new Error("1C unavailable"));

    await expect(service(repository, provider).syncOwnCompany("user-1", "full"))
      .rejects.toMatchObject({ code: "ORDER_HISTORY_PARTIAL_SUCCESS" });

    expect(repository.upsertBatch).toHaveBeenCalledTimes(1);
    expect(repository.failSync).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY_ID }));
    expect(repository.completeSync).not.toHaveBeenCalled();
  });

  it("deduplicates Ref_Key values across pages", async () => {
    const repository = historyRepository([]);
    const first = historyDto(1);
    const second = historyDto(2);
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage([first], "100"))
      .mockResolvedValueOnce(historyPage([first, second], null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(result).toMatchObject({ rawReceived: 3, received: 2, duplicatesIgnored: 1 });
    expect(repository.upsertBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ orders: [second] }));
  });

  it("fails safely when pagination repeats a page without a new Ref_Key", async () => {
    const repository = historyRepository([]);
    const order = historyDto(1);
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage([order], "100"))
      .mockResolvedValueOnce(historyPage([order], "200"));

    await expect(service(repository, provider).syncOwnCompany("user-1", "full"))
      .rejects.toMatchObject({ code: "ORDER_HISTORY_PARTIAL_SUCCESS" });
    expect(repository.failSync).toHaveBeenCalled();
  });

  it("does not hide an explicit deletion until the full scan completes", async () => {
    const repository = historyRepository([]);
    const deleted = { ...historyDto(1), deletionMark: true };
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage([deleted], "100"))
      .mockRejectedValueOnce(new Error("1C unavailable"));

    await expect(service(repository, provider).syncOwnCompany("user-1", "full"))
      .rejects.toMatchObject({ code: "ORDER_HISTORY_PARTIAL_SUCCESS" });
    expect(repository.upsertBatch).not.toHaveBeenCalled();
  });

  it("persists explicit DeletionMark only after a complete scan", async () => {
    const repository = historyRepository([]);
    const deleted = { ...historyDto(1), deletionMark: true };
    const provider = orderProvider().mockResolvedValueOnce(historyPage([deleted], null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(repository.upsertBatch).toHaveBeenCalledTimes(1);
    expect(repository.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({ orders: [deleted] }));
    expect(result.hidden).toBe(1);
  });

  it("persists a page containing non-fatal reference enrichment warnings", async () => {
    const repository = historyRepository([]);
    const unresolved = { ...historyDto(1), stateCode: "unknown" as const, currencyCode: null };
    const provider = orderProvider().mockResolvedValueOnce(historyPage([unresolved], null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(repository.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({ orders: [unresolved] }));
    expect(result).toMatchObject({ received: 1, inserted: 1 });
    expect(repository.completeSync).toHaveBeenCalled();
  });

  it("does not replace a previously valid order when its line read is temporarily unavailable", async () => {
    const repository = historyRepository([]);
    const readable = historyDto(1);
    const unavailable = historyDto(2);
    const page = {
      ...historyPage([readable, unavailable], null),
      lineWarningCount: 1,
      lineReadFailedReferences: [unavailable.reference.externalId],
    };
    const provider = orderProvider().mockResolvedValueOnce(page);

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(repository.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({ orders: [readable] }));
    expect(result).toMatchObject({ received: 2, inserted: 1, lineWarnings: 1 });
  });

  it("passes sync identity and page number to the runtime provider", async () => {
    const repository = historyRepository([]);
    const provider = orderProvider().mockResolvedValueOnce(historyPage([historyDto(1)], null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      historySyncContext: { syncId: result.syncId, page: 1 },
    }));
  });

  it("uses the same atomic lock for manual synchronization", async () => {
    const repository = historyRepository([]);
    repository.startSync.mockResolvedValue("locked");
    const provider = orderProvider();
    await expect(service(repository, provider).syncOwnCompany("user-1", "full"))
      .rejects.toMatchObject({ code: "ORDER_HISTORY_LOCKED" });
    expect(provider).not.toHaveBeenCalled();
  });

  it("uses the trusted sync-state read for cron synchronization", async () => {
    const repository = historyRepository([]);
    const provider = orderProvider().mockResolvedValueOnce(historyPage([], null));

    await service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "full");

    expect(repository.getSyncStateForAutomation).toHaveBeenCalledWith(COMPANY_ID);
    expect(repository.getSyncState).not.toHaveBeenCalled();
  });

  it("continues safely after atomic stale-lock recovery", async () => {
    const repository = historyRepository([]);
    repository.startSync.mockResolvedValue("stale_lock_recovered");
    const provider = orderProvider().mockResolvedValueOnce(historyPage([], null));
    await expect(service(repository, provider).syncOwnCompany("user-1", "full")).resolves.toMatchObject({ received: 0 });
  });

  it("projects a bounded previously-purchased page with current commercial truth", async () => {
    const listPreviouslyPurchasedProducts = vi.fn().mockResolvedValue({
      items: [{
        product: {
          id: "product-1",
          sku: "400540",
          name: "Camera",
          slug: "camera",
          imageUrl: null,
          brand: null,
          category: { id: "category-1", parentId: null, name: "Video", slug: "video" },
          keyCharacteristics: [],
          merchandisingLabels: [],
          commercialSnapshot: {
            productId: "product-1",
            canViewStock: true,
            partnerPrice: { priceAmount: 50.6, currency: "USD", currencyStatus: "resolved", updatedAt: "2026-09-05T10:00:00Z" },
            msrpPrice: null,
            stock: { productId: "product-1", physicalQuantity: 10, reservedQuantity: 2, availableQuantity: 8, incomingQuantity: 0, hasVariantStock: false, syncedAt: "2026-09-05T10:00:00Z" },
            supplierArrival: null,
            partnerRate: null,
            retailRate: null,
          },
        },
        purchaseCount: 4,
        totalQuantity: 12,
        lastPurchasedAt: "2026-08-12T10:00:00Z",
        lastQuantity: 3,
        repeatPurchaseDue: true,
      }],
      totalCount: 1,
    });
    const repository = { ...historyRepository([]), listPreviouslyPurchasedProducts };

    const result = await service(repository).listPreviouslyPurchasedProducts("user-1", { limit: 5, offset: 0 });

    expect(listPreviouslyPurchasedProducts).toHaveBeenCalledWith({ companyId: COMPANY_ID, limit: 5, offset: 0 });
    expect(result.items[0]).toMatchObject({
      id: "product-1",
      categoryName: "Video",
      purchaseCount: 4,
      repeatPurchaseDue: true,
      commercialView: {
        partnerPrice: { amount: 50.6, currencyCode: "USD" },
        stock: { status: "in_stock", exactAvailableQuantity: 8 },
      },
    });
    expect(JSON.stringify(result)).not.toContain("retailPrice");
  });
});

function service(
  repository = historyRepository([]),
  fetchHistory = orderProvider(),
  effectivePermissionCodes = ["pricing.partner_price.view"],
  portalRepository = {
    listByCompanyId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue([]),
  } as unknown as PartnerOrderRepository,
  productReferenceService?: ProductReferenceService,
) {
  const companyAccess = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: COMPANY_ID, status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({
      company: { id: COMPANY_ID, displayName: "ALERT-SS SRL", external1cId: COUNTERPARTY },
      membership: { companyId: COMPANY_ID, status: "active" },
      user: { id: "user-1" },
    }),
  } as unknown as CompanyAccessService;
  const permission = {
    ensurePermission: vi.fn().mockResolvedValue(undefined),
    getEffectivePermissionContext: vi.fn().mockResolvedValue({
      effectivePermissionCodes,
    }),
  } as unknown as PermissionService;
  const provider = { fetchSalesOrderHistory: fetchHistory } as unknown as OrderProvider;
  return new DefaultPartnerOrderHistoryService(repository, portalRepository, companyAccess, permission, provider, undefined, productReferenceService);
}

function historyLine(orderHistoryId: string, id: string, productId: string | null, sku: string) {
  return {
    id,
    orderHistoryId,
    externalProductRef: `${sku}-ref`,
    productId,
    productName: productId ? "Camera" : "Legacy item",
    sku,
    quantity: 2,
    unitPrice: 10,
    lineTotal: 20,
    currencyCode: "USD",
    lineNumber: 1,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
}

function historyRepository(visible: PartnerOrderHistory[], auditRecord: PartnerOrderHistory | null = null) {
  return {
    auditRecord,
    getReorderSource: vi.fn().mockResolvedValue(null),
    listMergeIdentities: vi.fn().mockResolvedValue([]),
    listVisible: vi.fn().mockResolvedValue({ items: visible, total: visible.length }),
    findVisibleById: vi.fn().mockResolvedValue(visible[0] ?? null),
    listItemsByOrderIds: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn().mockResolvedValue([]),
    getSyncState: vi.fn().mockResolvedValue(null),
    getSyncStateForAutomation: vi.fn().mockResolvedValue(null),
    startSync: vi.fn().mockResolvedValue("acquired"),
    upsertBatch: vi.fn().mockImplementation(async (input: { orders: SalesOrderHistoryDTO[] }) => ({ inserted: input.orders.length, updated: 0, hidden: input.orders.filter((item) => item.deletionMark).length })),
    completeSync: vi.fn().mockResolvedValue(undefined),
    failSync: vi.fn().mockResolvedValue(undefined),
  } satisfies PartnerOrderHistoryRepository & { auditRecord: PartnerOrderHistory | null };
}

function confirmedPortalOrder() {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    companyId: COMPANY_ID,
    submittedBy: "user-1",
    cartId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    submissionKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    submissionAttemptId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    status: PartnerOrderStatus.Submitted,
    integrationStatus: PartnerOrderIntegrationStatus.Confirmed,
    oneCOrderStatus: null,
    requestedDeliveryDate: "2026-07-31",
    external1cRef: "99999999-9999-9999-9999-999999999999",
    external1cNumber: "NSUU-002027",
    external1cDate: "2026-07-29T11:40:03Z",
    payloadSnapshot: { items: [{ quantity: 2 }] },
    safeErrorCode: null,
    safeErrorMessage: null,
    documentTotal: 324.5,
    currencyCode: "USD",
    contractNumber: null,
    confirmedAt: "2026-07-29T11:40:04Z",
    lastReconciledAt: null,
    submittedAt: "2026-07-29T11:40:04Z",
    createdAt: "2026-07-29T11:40:03Z",
    updatedAt: "2026-07-29T11:40:04Z",
  };
}

function orderProvider() {
  return vi.fn<NonNullable<OrderProvider["fetchSalesOrderHistory"]>>();
}

function historyPage(items: SalesOrderHistoryDTO[], nextCursor: string | null) {
  return {
    items,
    nextCursor,
    rawRowCount: items.length,
    mappedRowCount: items.length,
    rejectedRowCount: 0,
    lineRowCount: items.reduce((sum, item) => sum + item.items.length, 0),
    lineWarningCount: 0,
    lineReadFailedReferences: [],
    duplicateRowCount: 0,
    enrichmentWarningCount: items.filter((item) => item.stateCode === "unknown" || item.currencyCode === null).length,
  };
}

function history(override: Partial<PartnerOrderHistory> = {}): PartnerOrderHistory {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    companyId: COMPANY_ID,
    portalOrderId: null,
    external1cOrderRef: "11111111-1111-1111-1111-111111111111",
    external1cOrderNumber: "NSUU-001",
    oneCPosted: true,
    oneCDeletionMark: false,
    oneCStateRef: "33333333-3333-3333-3333-333333333333",
    oneCStateRaw: "33333333-3333-3333-3333-333333333333",
    oneCStateCode: "open",
    oneCDocumentDate: "2026-07-15T10:00:00Z",
    oneCDeliveryDate: "2026-07-16",
    oneCSourceVersion: "v1",
    oneCLastSyncedAt: "2026-07-15T10:01:00Z",
    externalContractRef: null,
    externalCurrencyRef: null,
    documentTotal: 1000,
    currencyCode: "MDL",
    originType: "unknown_1c_source",
    partnerVisible: true,
    hiddenReason: null,
    positionCount: 1,
    totalUnitCount: 2,
    createdAt: "2026-07-15T10:01:00Z",
    updatedAt: "2026-07-15T10:01:00Z",
    ...override,
  };
}

function historyDto(index: number): SalesOrderHistoryDTO {
  const suffix = String(index + 1).padStart(12, "0");
  return {
    reference: ref(`11111111-1111-1111-1111-${suffix}`, "customer-order"),
    partnerCompanyReference: ref(COUNTERPARTY, "counterparty"),
    contractReference: null,
    currencyReference: null,
    currencyCode: "MDL",
    number: `NSUU-${index}`,
    documentDate: "2026-07-15T10:00:00Z",
    requestedDeliveryDate: null,
    posted: true,
    deletionMark: false,
    stateReference: null,
    stateRaw: null,
    stateCode: "open",
    documentTotal: 1,
    sourceVersion: `v${index}`,
    items: [],
  };
}

function ref(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
