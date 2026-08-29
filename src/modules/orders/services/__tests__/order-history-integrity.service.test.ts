import { describe, expect, it, vi } from "vitest";

import type { OrderProvider } from "../../../integration/contracts";
import type { OrderHistoryIntegrityRepository } from "../../repositories";
import type { OrderHistoryFullAuditClaim } from "../../types";
import { OrderHistoryIntegrityService } from "../order-history-integrity.service";

describe("OrderHistoryIntegrityService", () => {
  it("does no work when no governed audit is queued", async () => {
    const repository = repo(null);
    await expect(new OrderHistoryIntegrityService(repository, provider()).processOne()).resolves.toEqual({
      processed: false, auditId: null, status: null, rows: 0, hidden: 0,
    });
  });

  it("stages one deterministic header-only page per worker invocation", async () => {
    const repository = repo(claim());
    const source = provider();
    const result = await new OrderHistoryIntegrityService(repository, source).processOne();
    expect(source.fetchSalesOrderHistory).toHaveBeenCalledWith(expect.objectContaining({ historyReadMode: "integrity_headers" }));
    expect(repository.stagePage).toHaveBeenCalledWith(expect.objectContaining({
      pageNumber: 1,
      pageFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(repository.finishPass).toHaveBeenCalledWith(AUDIT_ID, 1);
    expect(result.status).toBe("second_pass_required");
  });

  it("fails closed before hiding when a pass reports duplicate identities", async () => {
    const repository = repo(claim());
    const source = provider({ duplicateRowCount: 1 });
    const result = await new OrderHistoryIntegrityService(repository, source).processOne();
    expect(repository.fail).toHaveBeenCalledWith(expect.anything(), expect.any(String), true);
    expect(repository.stagePage).not.toHaveBeenCalled();
    expect(repository.finishPass).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "integrity_failed", hidden: 0 });
  });
});

const AUDIT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function claim(): OrderHistoryFullAuditClaim {
  return {
    id: AUDIT_ID,
    companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    counterpartyRef: "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4",
    currentPass: 1,
    nextSkip: 0,
    pageSize: 100,
    leaseToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  };
}

function repo(value: OrderHistoryFullAuditClaim | null) {
  return {
    enqueue: vi.fn(),
    listAdmin: vi.fn(),
    claim: vi.fn().mockResolvedValue(value),
    stagePage: vi.fn().mockResolvedValue("pass_complete"),
    finishPass: vi.fn().mockResolvedValue({ status: "second_pass_required", hidden: 0 }),
    fail: vi.fn().mockResolvedValue(undefined),
  } as unknown as OrderHistoryIntegrityRepository & Record<string, ReturnType<typeof vi.fn>>;
}

function provider(options: { duplicateRowCount?: number } = {}) {
  return {
    fetchSalesOrderHistory: vi.fn().mockResolvedValue({
      items: [{
        reference: { providerCode: "one-c", externalId: "11111111-1111-1111-1111-111111111111", externalType: "customer-order" },
        partnerCompanyReference: { providerCode: "one-c", externalId: "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4", externalType: "counterparty" },
        contractReference: null,
        currencyReference: null,
        currencyCode: null,
        number: "NSUU-1",
        documentDate: "2026-08-10T12:00:00.000Z",
        requestedDeliveryDate: null,
        posted: true,
        deletionMark: false,
        stateReference: null,
        stateRaw: null,
        stateCode: null,
        documentTotal: 100,
        sourceVersion: "v1",
        items: [],
      }],
      nextCursor: null,
      rawRowCount: 1,
      mappedRowCount: 1,
      rejectedRowCount: 0,
      lineRowCount: 0,
      lineWarningCount: 0,
      lineReadFailedReferences: [],
      duplicateRowCount: options.duplicateRowCount ?? 0,
      enrichmentWarningCount: 0,
    }),
  } as unknown as OrderProvider & Record<string, ReturnType<typeof vi.fn>>;
}
