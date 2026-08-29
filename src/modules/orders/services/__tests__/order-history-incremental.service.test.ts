import { describe, expect, it, vi } from "vitest";

import type { OrderProvider } from "../../../integration/contracts";
import type { SalesOrderHistoryDTO } from "../../../integration/dto";
import type { PartnerOrderHistoryRepository, PartnerOrderRepository } from "../../repositories";
import type { PartnerOrderHistory, PartnerOrderHistorySyncState } from "../../types";
import { DefaultPartnerOrderHistoryService } from "../order-history.service";

describe("partner order-history true incremental synchronization", () => {
  it("does not fetch lines or rewrite rows for unchanged Ref_Key plus DataVersion", async () => {
    const repository = repo();
    const provider = source();
    const result = await service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "incremental");

    expect(provider.fetchSalesOrderHistory).toHaveBeenCalledWith(expect.objectContaining({
      historyReadMode: "incremental_headers",
      historyDateFrom: "2026-08-07T12:00:00.000Z",
    }));
    expect(provider.fetchSalesOrderHistoryByReferences).not.toHaveBeenCalled();
    expect(repository.upsertBatch).not.toHaveBeenCalled();
    expect(repository.completeSync).toHaveBeenCalledWith(expect.objectContaining({
      incrementalDateWatermark: "2026-08-10T12:00:00.000Z",
      metrics: expect.objectContaining({ unchangedOrders: 1, lineRequests: 0, oneCRequestCount: 2 }),
    }));
    expect(result).toMatchObject({ unchangedOrders: 1, dbWrites: 1, oneCRequestCount: 2 });
  });

  it("fetches and persists details only when DataVersion changed", async () => {
    const repository = repo({ knownVersion: "v1", verificationVersion: "v2" });
    const provider = source({ headerVersion: "v2", detailVersion: "v2" });
    const result = await service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "incremental");

    expect(provider.fetchSalesOrderHistoryByReferences).toHaveBeenCalledTimes(1);
    expect(repository.upsertBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ changedOrders: 1, unchangedOrders: 0, updated: 1 });
  });

  it("does not advance the Date watermark after source failure", async () => {
    const repository = repo();
    const provider = source();
    vi.mocked(provider.fetchSalesOrderHistory).mockRejectedValueOnce(new Error("transport"));

    await expect(service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "incremental")).rejects.toThrow();
    expect(repository.completeSync).not.toHaveBeenCalled();
    expect(repository.failSync).toHaveBeenCalledTimes(1);
  });

  it("preserves visibility when exact verification is unknown", async () => {
    const repository = repo();
    const provider = source({ existenceStatus: "unknown" });
    await service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "incremental");
    expect(repository.applyExistenceResults).toHaveBeenLastCalledWith(expect.objectContaining({
      results: [{ external1cOrderRef: ORDER_REF, status: "unknown" }],
    }));
  });

  it("repairs a hidden document that reappears without a manual action", async () => {
    const repository = repo({ hidden: true });
    const provider = source();
    await service(repository, provider).syncCompany(COMPANY_ID, COUNTERPARTY, "incremental");
    expect(provider.fetchSalesOrderHistoryByReferences).toHaveBeenCalled();
    expect(repository.applyExistenceResults).toHaveBeenCalledWith(expect.objectContaining({
      results: expect.arrayContaining([{ external1cOrderRef: ORDER_REF, status: "exists" }]),
    }));
  });
});

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COUNTERPARTY = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";
const ORDER_REF = "11111111-1111-1111-1111-111111111111";

function service(repository: ReturnType<typeof repo>, provider: ReturnType<typeof source>) {
  return new DefaultPartnerOrderHistoryService(
    repository,
    {} as PartnerOrderRepository,
    {} as never,
    {} as never,
    provider,
  );
}

function repo(options: { knownVersion?: string; verificationVersion?: string; hidden?: boolean } = {}) {
  const candidate = history({
    oneCSourceVersion: options.verificationVersion ?? options.knownVersion ?? "v1",
    partnerVisible: !options.hidden,
    hiddenReason: options.hidden ? "missing_from_1c" : null,
  });
  return {
    getSyncStateForAutomation: vi.fn().mockResolvedValue(syncState()),
    getSyncState: vi.fn().mockResolvedValue(syncState()),
    startSync: vi.fn().mockResolvedValue("acquired"),
    listKnownHeaders: vi.fn().mockResolvedValue([{
      external1cOrderRef: ORDER_REF,
      oneCSourceVersion: options.knownVersion ?? "v1",
      partnerVisible: candidate.partnerVisible,
      hiddenReason: candidate.hiddenReason,
      oneCDeletionMark: false,
      currencyCode: "MDL",
    }]),
    listExistenceVerificationCandidates: vi.fn().mockResolvedValue([candidate]),
    applyExistenceResults: vi.fn().mockImplementation(async (input: { results: Array<{ status: string }> }) => ({
      updated: input.results.length,
      hidden: input.results.filter((item) => item.status === "absent" || item.status === "deletion_marked").length,
      restored: input.results.filter((item) => item.status === "exists" && options.hidden).length,
    })),
    upsertBatch: vi.fn().mockResolvedValue({ inserted: 0, updated: 1, hidden: 0 }),
    completeSync: vi.fn().mockResolvedValue(undefined),
    failSync: vi.fn().mockResolvedValue(undefined),
  } as unknown as PartnerOrderHistoryRepository & Record<string, ReturnType<typeof vi.fn>>;
}

function source(options: { headerVersion?: string; detailVersion?: string; existenceStatus?: "exists" | "unknown" } = {}) {
  const header = dto(options.headerVersion ?? "v1", []);
  const detail = dto(options.detailVersion ?? options.headerVersion ?? "v1", [{
    lineNumber: 1,
    productReference: reference("22222222-2222-2222-2222-222222222222", "catalog-product"),
    characteristicReference: null,
    quantity: 1,
    unitPrice: 100,
    lineTotal: 100,
  }]);
  return {
    fetchSalesOrderHistory: vi.fn().mockResolvedValue(page([header])),
    fetchSalesOrderHistoryByReferences: vi.fn().mockResolvedValue({ ...page([detail]), lineRowCount: 1, requestCount: 1 }),
    verifySalesOrderHistoryReferences: vi.fn().mockResolvedValue({
      results: [{ reference: header.reference, status: options.existenceStatus ?? "exists", header: options.existenceStatus === "unknown" ? null : header }],
      requestCount: 1,
      requestDurationMs: 1,
    }),
  } as unknown as OrderProvider & Record<string, ReturnType<typeof vi.fn>>;
}

function syncState(): PartnerOrderHistorySyncState {
  return {
    companyId: COMPANY_ID,
    counterpartyRef: COUNTERPARTY,
    status: "succeeded",
    syncMode: "incremental",
    activeSyncId: null,
    lastSuccessfulFullSyncAt: "2026-08-01T00:00:00.000Z",
    lastIncrementalSyncAt: "2026-08-10T12:00:00.000Z",
    lastSourceVersion: null,
    incrementalDateWatermark: "2026-08-10T12:00:00.000Z",
    integrityState: "healthy",
    lastSuccessfulFullAuditAt: null,
    fullAuditRequestedAt: null,
    safeError: null,
    recordsReceived: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    recordsHidden: 0,
    startedAt: null,
    finishedAt: null,
  };
}

function history(override: Partial<PartnerOrderHistory> = {}): PartnerOrderHistory {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    companyId: COMPANY_ID,
    portalOrderId: null,
    external1cOrderRef: ORDER_REF,
    external1cOrderNumber: "NSUU-1",
    oneCPosted: true,
    oneCDeletionMark: false,
    oneCStateRef: null,
    oneCStateRaw: null,
    oneCStateCode: "open",
    oneCDocumentDate: "2026-08-10T12:00:00.000Z",
    oneCDeliveryDate: null,
    oneCSourceVersion: "v1",
    oneCLastSyncedAt: "2026-08-10T12:01:00.000Z",
    externalContractRef: null,
    externalCurrencyRef: null,
    documentTotal: 100,
    currencyCode: "MDL",
    originType: "unknown_1c_source",
    partnerVisible: true,
    hiddenReason: null,
    positionCount: 1,
    totalUnitCount: 1,
    createdAt: "2026-08-10T12:01:00.000Z",
    updatedAt: "2026-08-10T12:01:00.000Z",
    ...override,
  };
}

function dto(version: string, items: SalesOrderHistoryDTO["items"]): SalesOrderHistoryDTO {
  return {
    reference: reference(ORDER_REF, "customer-order"),
    partnerCompanyReference: reference(COUNTERPARTY, "counterparty"),
    contractReference: null,
    currencyReference: null,
    currencyCode: "MDL",
    number: "NSUU-1",
    documentDate: "2026-08-10T12:00:00.000Z",
    requestedDeliveryDate: null,
    posted: true,
    deletionMark: false,
    stateReference: null,
    stateRaw: null,
    stateCode: "open",
    documentTotal: 100,
    sourceVersion: version,
    items,
  };
}

function page(items: SalesOrderHistoryDTO[]) {
  return {
    items,
    nextCursor: null,
    rawRowCount: items.length,
    mappedRowCount: items.length,
    rejectedRowCount: 0,
    lineRowCount: 0,
    lineWarningCount: 0,
    lineReadFailedReferences: [],
    duplicateRowCount: 0,
    enrichmentWarningCount: 0,
    requestCount: 1,
  };
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
