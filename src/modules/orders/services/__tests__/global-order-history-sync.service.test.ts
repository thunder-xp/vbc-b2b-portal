import { describe, expect, it, vi } from "vitest";

import type { OrderProvider } from "../../../integration/contracts";
import type { GlobalOrderHistoryRepository } from "../../repositories";
import { GlobalOrderHistorySyncService } from "../global-order-history-sync.service";

describe("GlobalOrderHistorySyncService", () => {
  it("streams bounded header and item pages through one resumable checkpoint", async () => {
    const repository = repositoryMock();
    const provider = providerMock();
    const service = new GlobalOrderHistorySyncService(repository, provider, () => 1000);

    const result = await service.synchronize({ maxDataPages: 4 });

    expect(result).toMatchObject({ status: "completed", phase: "completed", dataPages: 4 });
    expect(provider.fetchGlobalOrderHistoryCounterparties).toHaveBeenCalledTimes(2);
    expect(provider.fetchGlobalSalesOrderHistoryHeaders).toHaveBeenCalledTimes(2);
    expect(provider.fetchGlobalSalesOrderHistoryItems).toHaveBeenCalledTimes(2);
    expect(repository.persistHeaderPage).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: "0", hasMore: true }));
    expect(repository.persistHeaderPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "1000", hasMore: false }));
    expect(repository.persistItemPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "1000", hasMore: false }));
    expect(repository.release).not.toHaveBeenCalled();
  });

  it("releases its lock at the page budget and resumes from persisted cursors", async () => {
    const repository = repositoryMock();
    const provider = providerMock();
    const service = new GlobalOrderHistorySyncService(repository, provider);

    const result = await service.synchronize({ maxDataPages: 1 });

    expect(result.status).toBe("continued");
    expect(repository.release).toHaveBeenCalledWith("lock-1");
    expect(provider.fetchGlobalSalesOrderHistoryHeaders).toHaveBeenCalledTimes(1);
    expect(provider.fetchGlobalSalesOrderHistoryItems).not.toHaveBeenCalled();
  });

  it("fails closed when any source page contains rejected rows", async () => {
    const repository = repositoryMock();
    const provider = providerMock();
    vi.mocked(provider.fetchGlobalSalesOrderHistoryHeaders!).mockReset().mockResolvedValueOnce({
      items: [], nextCursor: null, rawRowCount: 1, rejectedRowCount: 1,
      requestCount: 1, requestDurationMs: 1,
    });
    const service = new GlobalOrderHistorySyncService(repository, provider);

    await expect(service.synchronize()).rejects.toThrow("contained rejected rows");
    expect(repository.persistHeaderPage).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith("lock-1", "Error");
  });
});

function repositoryMock(): GlobalOrderHistoryRepository {
  return {
    acquire: vi.fn().mockResolvedValue({
      status: "running", phase: "headers", lockToken: "lock-1",
      headerCursor: "0", itemCursor: "0",
    }),
    persistHeaderPage: vi.fn().mockResolvedValue({ inserted: 1, updated: 0, eligible: 1, nextPhase: "headers" }),
    persistItemPage: vi.fn()
      .mockResolvedValueOnce({ upserted: 1, eligible: 1, completed: false })
      .mockResolvedValueOnce({ upserted: 1, eligible: 1, completed: true }),
    release: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    getSummary: vi.fn(),
  };
}

function providerMock(): OrderProvider {
  const counterparty = {
    reference: { providerCode: "one-c", externalId: "11111111-1111-4111-8111-111111111111", externalType: "counterparty" },
    deletionMark: false,
    counterpartyTypeCode: "ЮридическоеЛицо",
    governmentBodyTypeCode: null,
  };
  const basePage = { rawRowCount: 1, rejectedRowCount: 0, requestCount: 1, requestDurationMs: 1 };
  const header = {
    reference: { providerCode: "one-c", externalId: "22222222-2222-4222-8222-222222222222", externalType: "customer-order" },
    partnerCompanyReference: counterparty.reference,
    contractReference: null, currencyReference: null, currencyCode: "MDL", number: "1",
    documentDate: "2020-01-01T00:00:00Z", requestedDeliveryDate: null,
    posted: true, deletionMark: false, stateReference: null, stateRaw: "Завершен",
    stateCode: "completed" as const, documentTotal: 10, sourceVersion: "1", items: [],
    sourceCounterpartyTypeCode: null, sourceGovernmentBodyTypeCode: null,
    sourceOperationCode: "ЗаказНаПродажу",
  };
  const item = {
    orderReference: header.reference, lineNumber: 1,
    productReference: { providerCode: "one-c", externalId: "33333333-3333-4333-8333-333333333333", externalType: "product" },
    characteristicReference: null, quantity: 1, unitPrice: 10, lineTotal: 10,
  };
  return {
    fetchSalesOrders: vi.fn(), createSalesOrder: vi.fn(), fetchSalesOrderHistory: vi.fn(),
    fetchGlobalOrderHistoryCounterparties: vi.fn()
      .mockResolvedValueOnce({ ...basePage, items: [counterparty], nextCursor: "1000" })
      .mockResolvedValueOnce({ ...basePage, items: [], rawRowCount: 0, nextCursor: null }),
    fetchGlobalSalesOrderHistoryHeaders: vi.fn()
      .mockResolvedValueOnce({ ...basePage, items: [header], nextCursor: "1000" })
      .mockResolvedValueOnce({ ...basePage, items: [header], nextCursor: null }),
    fetchGlobalSalesOrderHistoryItems: vi.fn()
      .mockResolvedValueOnce({ ...basePage, items: [item], nextCursor: "1000" })
      .mockResolvedValueOnce({ ...basePage, items: [item], nextCursor: null }),
  } as unknown as OrderProvider;
}
