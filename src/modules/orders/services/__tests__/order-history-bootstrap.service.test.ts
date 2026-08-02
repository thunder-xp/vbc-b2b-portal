import { describe, expect, it, vi } from "vitest";

import type { OrderHistoryBootstrapRepository } from "../../repositories";
import type { PartnerOrderHistoryService } from "../order-history.service";
import { OrderHistoryBootstrapService } from "../order-history-bootstrap.service";

const CLAIM = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  counterpartyRef: "33333333-3333-4333-8333-333333333333",
  lockToken: "44444444-4444-4444-8444-444444444444",
  historyFrom: "2024-08-02T00:00:00Z",
  historyTo: "2026-08-02T00:00:00Z",
};

describe("OrderHistoryBootstrapService", () => {
  it("runs the existing bounded full-history importer and publishes one claimed job", async () => {
    const repository = fakeRepository();
    const history = fakeHistoryService();
    const result = await new OrderHistoryBootstrapService(repository, history).processOne();
    expect(result).toEqual({ processed: true, bootstrapId: CLAIM.id, companyId: CLAIM.companyId });
    expect(history.syncCompany).toHaveBeenCalledWith(CLAIM.companyId, CLAIM.counterpartyRef, "full");
    expect(repository.complete).toHaveBeenCalledWith(CLAIM, expect.objectContaining({ pagesFetched: 2, rawReceived: 125, received: 124 }));
  });

  it("does not perform 1C work when no company is queued", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.claim).mockResolvedValue(null);
    const history = fakeHistoryService();
    await expect(new OrderHistoryBootstrapService(repository, history).processOne()).resolves.toEqual({ processed: false, bootstrapId: null, companyId: null });
    expect(history.syncCompany).not.toHaveBeenCalled();
  });

  it("preserves prior history and records a retryable provider failure", async () => {
    const repository = fakeRepository();
    const history = fakeHistoryService();
    vi.mocked(history.syncCompany).mockRejectedValue(new Error("transport"));
    await expect(new OrderHistoryBootstrapService(repository, history).processOne()).rejects.toThrow("transport");
    expect(repository.fail).toHaveBeenCalledWith(CLAIM, "Error", true);
    expect(repository.complete).not.toHaveBeenCalled();
  });
});

function fakeRepository(): OrderHistoryBootstrapRepository {
  return {
    ensureFirstAccess: vi.fn(), getStatus: vi.fn(), claim: vi.fn().mockResolvedValue(CLAIM),
    complete: vi.fn(), fail: vi.fn(), listAdmin: vi.fn(), enqueueAdmin: vi.fn(),
  };
}

function fakeHistoryService(): PartnerOrderHistoryService {
  return {
    list: vi.fn(), listPlannedShipments: vi.fn(), get: vi.fn(), syncOwnCompany: vi.fn(),
    syncCompany: vi.fn().mockResolvedValue({ syncId: "sync", pagesFetched: 2, rowsPerPage: [100, 25], rawReceived: 125, received: 124, duplicatesIgnored: 1, linesFetched: 124, rejected: 0, inserted: 120, updated: 4, hidden: 0, enrichmentWarnings: 0, lineWarnings: 0 }),
    createDateChangeRequest: vi.fn(), cancelDateChangeRequest: vi.fn(),
  };
}
