import { describe, expect, it, vi } from "vitest";
import { WarrantySerialSyncService } from "../sync.service";

describe("WarrantySerialSyncService batch", () => {
  it("processes bounded pages and stops after completion", async () => {
    const repository = {
      claim: vi.fn()
        .mockResolvedValueOnce(claim("sale_scan", 0))
        .mockResolvedValueOnce(claim("state_rebuild", 0)),
      publish: vi.fn().mockResolvedValue({}),
      complete: vi.fn().mockResolvedValue({}),
      fail: vi.fn(),
    };
    const provider = { fetchPage: vi.fn().mockResolvedValue({ documents: [], events: [], headersReceived: 0, pageComplete: true }) };
    const result = await new WarrantySerialSyncService(provider as never, repository as never).runBatch(20);
    expect(result).toMatchObject({ status: "completed", steps: 2, headersReceived: 0 });
    expect(repository.complete).toHaveBeenCalledOnce();
  });

  it("never exceeds the configured step bound", async () => {
    const repository = { claim: vi.fn().mockResolvedValue(claim("sale_scan", 0)), publish: vi.fn(), complete: vi.fn(), fail: vi.fn() };
    const provider = { fetchPage: vi.fn().mockResolvedValue({ documents: [], events: [], headersReceived: 25, pageComplete: false }) };
    const result = await new WarrantySerialSyncService(provider as never, repository as never).runBatch(3);
    expect(result).toMatchObject({ status: "progressed", steps: 3, headersReceived: 75 });
    expect(provider.fetchPage).toHaveBeenCalledTimes(3);
  });

  it("quarantines malformed source serials without aborting a page", async () => {
    process.env.WARRANTY_SERIAL_HASH_SECRET = "h".repeat(48);
    process.env.WARRANTY_SERIAL_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const repository = { claim: vi.fn().mockResolvedValueOnce(claim("sale_scan", 0)).mockResolvedValueOnce(null), publish: vi.fn(), complete: vi.fn(), fail: vi.fn() };
    const provider = { fetchPage: vi.fn().mockResolvedValue({ documents: [], headersReceived: 1, pageComplete: true, events: [{ serial: "BAD*SERIAL", eventType: "sale_observed", sourceEntity: "Document_РасходнаяНакладная", sourceDocumentRef: "11111111-1111-1111-1111-111111111111", relatedSourceDocumentRef: null, sourceDocumentNumber: "NS-1", sourceDocumentDate: "2026-08-01T00:00:00Z", sourcePosted: true, sourceDeletionMark: false, sourceDataVersion: "1", sourceLineNumber: 1, sourceSerialLineNumber: 1, sourceLinkKey: "A", counterpartyRef: null, productRef: null, characteristicRef: null, organizationRef: null, warehouseRef: null, quantity: 1, productSkuSnapshot: null, productNameSnapshot: null, warrantyMonthsSnapshot: null, mappingState: "mapped", reviewReasonCodes: [] }] }) };
    const result = await new WarrantySerialSyncService(provider as never, repository as never).runBatch(2);
    expect(result.status).toBe("progressed");
    expect(repository.publish).toHaveBeenCalledWith(expect.objectContaining({ events: [] }));
    delete process.env.WARRANTY_SERIAL_HASH_SECRET;
    delete process.env.WARRANTY_SERIAL_ENCRYPTION_KEY;
  });
});

function claim(stage: "sale_scan" | "return_scan" | "state_rebuild", skip: number) {
  return { runId: "11111111-1111-1111-1111-111111111111", lockToken: "22222222-2222-2222-2222-222222222222", mode: "full", stage, skip, pageSize: 25, rangeStart: "2021-08-06", rangeEnd: "2026-08-06" };
}
