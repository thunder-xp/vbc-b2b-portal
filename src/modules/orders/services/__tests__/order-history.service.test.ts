import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyAccessService, PermissionService } from "../../../access-control/services";
import { NotFoundError } from "../../../access-control/services";
import type { OrderProvider } from "../../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type { PartnerOrderHistoryRepository, PartnerOrderRepository } from "../../repositories";
import type { PartnerOrderHistory } from "../../types";
import { DefaultPartnerOrderHistoryService } from "../order-history.service";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";

describe("DefaultPartnerOrderHistoryService", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["open", "Открыт"],
    ["preorder", "Предзаказ"],
    ["test", "Тест"],
    ["completed", "Завершен"],
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

  it("returns safe not-found while the deleted audit record remains in the repository", async () => {
    const deleted = history({ partnerVisible: false, oneCDeletionMark: true, hiddenReason: "deleted_in_1c" });
    const repository = historyRepository([], deleted);
    await expect(service(repository).get("user-1", deleted.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.auditRecord).toBe(deleted);
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

    await expect(service(repository, provider).syncOwnCompany("user-1", "full")).rejects.toThrow("1C unavailable");

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
      .rejects.toThrow("repeated a page");
    expect(repository.failSync).toHaveBeenCalled();
  });

  it("does not hide an explicit deletion until the full scan completes", async () => {
    const repository = historyRepository([]);
    const deleted = { ...historyDto(1), deletionMark: true };
    const provider = orderProvider()
      .mockResolvedValueOnce(historyPage([deleted], "100"))
      .mockRejectedValueOnce(new Error("1C unavailable"));

    await expect(service(repository, provider).syncOwnCompany("user-1", "full")).rejects.toThrow("1C unavailable");
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

  it("passes sync identity and page number to the runtime provider", async () => {
    const repository = historyRepository([]);
    const provider = orderProvider().mockResolvedValueOnce(historyPage([historyDto(1)], null));

    const result = await service(repository, provider).syncOwnCompany("user-1", "full");

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      historySyncContext: { syncId: result.syncId, page: 1 },
    }));
  });
});

function service(repository = historyRepository([]), fetchHistory = orderProvider()) {
  const companyAccess = {
    getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: COMPANY_ID, status: "active" }]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({
      company: { id: COMPANY_ID, displayName: "ALERT-SS SRL", external1cId: COUNTERPARTY },
      membership: { companyId: COMPANY_ID, status: "active" },
      user: { id: "user-1" },
    }),
  } as unknown as CompanyAccessService;
  const permission = { ensurePermission: vi.fn().mockResolvedValue(undefined) } as unknown as PermissionService;
  const provider = { fetchSalesOrderHistory: fetchHistory } as unknown as OrderProvider;
  const portalRepository = {} as PartnerOrderRepository;
  return new DefaultPartnerOrderHistoryService(repository, portalRepository, companyAccess, permission, provider);
}

function historyRepository(visible: PartnerOrderHistory[], auditRecord: PartnerOrderHistory | null = null) {
  return {
    auditRecord,
    listVisible: vi.fn().mockResolvedValue({ items: visible, total: visible.length }),
    findVisibleById: vi.fn().mockResolvedValue(visible[0] ?? null),
    listItemsByOrderIds: vi.fn().mockResolvedValue([]),
    listEvents: vi.fn().mockResolvedValue([]),
    getSyncState: vi.fn().mockResolvedValue(null),
    startSync: vi.fn().mockResolvedValue(undefined),
    upsertBatch: vi.fn().mockImplementation(async (input: { orders: SalesOrderHistoryDTO[] }) => ({ inserted: input.orders.length, updated: 0, hidden: input.orders.filter((item) => item.deletionMark).length })),
    completeSync: vi.fn().mockResolvedValue(undefined),
    failSync: vi.fn().mockResolvedValue(undefined),
  } satisfies PartnerOrderHistoryRepository & { auditRecord: PartnerOrderHistory | null };
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
