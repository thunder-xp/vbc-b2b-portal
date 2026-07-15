import { describe, expect, it, vi } from "vitest";

import type { OrderProvider } from "../../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type { PartnerOrderHistoryRepository } from "../../repositories";
import type { PartnerOrderHistory } from "../../types";
import type { PartnerOrderHistoryService } from "../order-history.service";
import { PartnerOrderHistoryAutomationService } from "../order-history-automation.service";

describe("PartnerOrderHistoryAutomationService", () => {
  it("uses one bounded eligibility query and exact-reference provider reads", async () => {
    const repository = repo([candidate()]);
    const provider = exactProvider([dto()]);
    const result = await service(repository, provider).refreshActiveOrders();
    expect(repository.listActiveRefreshCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
    expect(provider.fetchSalesOrderHistoryByReferences).toHaveBeenCalledWith(expect.objectContaining({ orderReferences: [{ providerCode: "one-c", externalId: ORDER_REF, externalType: "customer-order" }] }));
    expect(result).toMatchObject({ received: 1, unchanged: 1, updated: 0, concurrencyLimit: 5 });
    expect(repository.upsertBatch).not.toHaveBeenCalled();
    expect(repository.touchSynchronizedOrders).toHaveBeenCalledTimes(1);
  });

  it("updates changed state once and preserves a known currency when enrichment fails", async () => {
    const repository = repo([candidate()]);
    const provider = exactProvider([{ ...dto(), posted: true, stateCode: "completed", stateRaw: "Завершен", currencyCode: null }]);
    await service(repository, provider).refreshActiveOrders();
    expect(repository.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({
      orders: [expect.objectContaining({ stateCode: "completed", currencyCode: "MDL" })],
    }));
  });

  it("processes company histories sequentially and isolates failures", async () => {
    const repository = repo([]);
    repository.listSyncCompanies!.mockResolvedValue([{ companyId: "company-1", counterpartyRef: COUNTERPARTY }, { companyId: "company-2", counterpartyRef: COUNTERPARTY }]);
    const historyService = { syncCompany: vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce({}) } as unknown as PartnerOrderHistoryService;
    const result = await new PartnerOrderHistoryAutomationService(repository, exactProvider([]), historyService).refreshCompanyHistories();
    expect(result).toEqual({ companies: 2, completed: 1, skipped: 0, failed: 1 });
    expect(historyService.syncCompany).toHaveBeenCalledTimes(2);
  });
});

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const ORDER_REF = "11111111-1111-1111-1111-111111111111";

function service(repository: ReturnType<typeof repo>, provider: ReturnType<typeof exactProvider>) {
  return new PartnerOrderHistoryAutomationService(repository, provider, { syncCompany: vi.fn() } as unknown as PartnerOrderHistoryService, () => Date.parse("2026-07-15T12:00:00Z"));
}

function repo(candidates: Array<{ order: PartnerOrderHistory; counterpartyRef: string }>) {
  return {
    listActiveRefreshCandidates: vi.fn().mockResolvedValue(candidates),
    touchSynchronizedOrders: vi.fn().mockResolvedValue(candidates.length),
    listSyncCompanies: vi.fn().mockResolvedValue([]),
    upsertBatch: vi.fn().mockResolvedValue({ inserted: 0, updated: 1, hidden: 0 }),
  } as unknown as PartnerOrderHistoryRepository & {
    listActiveRefreshCandidates: ReturnType<typeof vi.fn>;
    touchSynchronizedOrders: ReturnType<typeof vi.fn>;
    listSyncCompanies: ReturnType<typeof vi.fn>;
    upsertBatch: ReturnType<typeof vi.fn>;
  };
}

function exactProvider(items: SalesOrderHistoryDTO[]) {
  return { fetchSalesOrderHistoryByReferences: vi.fn().mockResolvedValue({ items, nextCursor: null, rawRowCount: items.length, mappedRowCount: items.length, rejectedRowCount: 0, lineRowCount: items.length, duplicateRowCount: 0, enrichmentWarningCount: 0 }) } as unknown as OrderProvider & { fetchSalesOrderHistoryByReferences: ReturnType<typeof vi.fn> };
}

function candidate() { return { order: history(), counterpartyRef: COUNTERPARTY }; }
function history(): PartnerOrderHistory { return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", companyId: COMPANY_ID, portalOrderId: null, external1cOrderRef: ORDER_REF, external1cOrderNumber: "NSUU-1", oneCPosted: false, oneCDeletionMark: false, oneCStateRef: null, oneCStateRaw: null, oneCStateCode: null, oneCDocumentDate: "2026-07-15T10:00:00Z", oneCDeliveryDate: "2026-07-20", oneCSourceVersion: "v1", oneCLastSyncedAt: "2026-07-15T10:00:00Z", externalContractRef: null, externalCurrencyRef: null, documentTotal: 100, currencyCode: "MDL", originType: "unknown_1c_source", partnerVisible: true, hiddenReason: null, positionCount: 1, totalUnitCount: 1, createdAt: "2026-07-15T10:00:00Z", updatedAt: "2026-07-15T10:00:00Z" }; }
function dto(): SalesOrderHistoryDTO { return { reference: ref(ORDER_REF, "customer-order"), partnerCompanyReference: ref(COUNTERPARTY, "counterparty"), contractReference: null, currencyReference: null, number: "NSUU-1", documentDate: "2026-07-15T10:00:00Z", requestedDeliveryDate: "2026-07-20", posted: false, deletionMark: false, documentTotal: 100, sourceVersion: "v1", stateReference: null, stateRaw: null, stateCode: null, currencyCode: "MDL", items: [{ lineNumber: 1, productReference: ref("22222222-2222-2222-2222-222222222222", "catalog-product"), characteristicReference: null, quantity: 1, unitPrice: 100, lineTotal: 100 }] }; }
function ref(externalId: string, externalType: string) { return { providerCode: "one-c", externalId, externalType }; }
