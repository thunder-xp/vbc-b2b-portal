import { beforeEach, describe, expect, it, vi } from "vitest";

import { OneCServiceSerialProvider } from "../one-c-service-history.provider";
import { ServiceHistorySyncService } from "../sync.service";

const SERIAL_A = "11111111-1111-1111-1111-111111111111";
const SERIAL_B = "22222222-2222-2222-2222-222222222222";

describe("1C service-history serial enrichment", () => {
  beforeEach(() => {
    process.env.WARRANTY_SERIAL_HASH_SECRET = "service-history-test-hmac-secret-value";
    process.env.WARRANTY_SERIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("resolves unique Serie_Key values in one exact batch and caches them", async () => {
    const client = {
      getLiteralGuidBatch: vi.fn().mockResolvedValue({ value: [
        { Ref_Key: SERIAL_A, Description: " sn-001 ", DeletionMark: false, DataVersion: "A" },
        { Ref_Key: SERIAL_B, Description: "SN-002", DeletionMark: false, DataVersion: "B" },
      ] }),
    };
    const provider = new OneCServiceSerialProvider(client as never);
    const first = await provider.resolve([SERIAL_A, SERIAL_A, SERIAL_B]);
    const second = await provider.resolve([SERIAL_A]);

    expect(client.getLiteralGuidBatch).toHaveBeenCalledOnce();
    expect(client.getLiteralGuidBatch).toHaveBeenCalledWith("Catalog_СерииНоменклатуры", {
      refs: [SERIAL_A, SERIAL_B], select: "Ref_Key,Description,DeletionMark,DataVersion",
    }, expect.anything());
    expect(first.get(SERIAL_A)).toMatchObject({ state: "resolved", value: "sn-001" });
    expect(second.get(SERIAL_A)).toEqual(first.get(SERIAL_A));
  });

  it("marks missing, deleted, and duplicate catalog identities safely", async () => {
    const client = { getLiteralGuidBatch: vi.fn().mockResolvedValue({ value: [
      { Ref_Key: SERIAL_A, Description: "SN-001", DeletionMark: false },
      { Ref_Key: SERIAL_A, Description: "SN-OTHER", DeletionMark: false },
    ] }) };
    const result = await new OneCServiceSerialProvider(client as never).resolve([SERIAL_A, SERIAL_B]);
    expect(result.get(SERIAL_A)?.state).toBe("conflict");
    expect(result.get(SERIAL_B)?.state).toBe("unmapped");
  });

  it("protects one batch and never derives serial identity from free text", async () => {
    const claim = {
      runId: "run-1", lockToken: "lock-1", pageComplete: true,
      rows: [{ id: "row-1", serialRef: SERIAL_A }, { id: "row-2", serialRef: SERIAL_A }],
    };
    const repository = {
      claimSerialEnrichment: vi.fn().mockResolvedValue(claim),
      publishSerialEnrichment: vi.fn().mockResolvedValue({ warrantyLinked: 1 }),
      failSerialEnrichment: vi.fn(),
    };
    const serialProvider = { resolve: vi.fn().mockResolvedValue(new Map([[SERIAL_A, {
      state: "resolved", value: "SN-001", sourceFingerprint: "a".repeat(64),
    }]])) };
    const service = new ServiceHistorySyncService({} as never, repository as never, serialProvider as never);
    const result = await service.runSerialEnrichmentStep();
    const published = repository.publishSerialEnrichment.mock.calls[0]![0].rows;

    expect(result.status).toBe("completed");
    expect(serialProvider.resolve).toHaveBeenCalledWith([SERIAL_A, SERIAL_A]);
    expect(published).toHaveLength(2);
    expect(published[0]).toMatchObject({ resolution_state: "resolved", masked_serial: "S***1" });
    expect(JSON.stringify(published)).not.toContain("free text");
  });

  it("does not retry or fail a serial-enrichment lease owned by a newer worker", async () => {
    const claim = { runId: "run-1", lockToken: "lock-1", pageComplete: false, rows: [] };
    const repository = {
      claimSerialEnrichment: vi.fn().mockResolvedValue(claim),
      publishSerialEnrichment: vi.fn().mockResolvedValue({ status: "coordination_conflict", code: "lease_lost", runId: "run-1" }),
      failSerialEnrichment: vi.fn(),
    };
    const service = new ServiceHistorySyncService({} as never, repository as never, { resolve: vi.fn().mockResolvedValue(new Map()) } as never);
    await expect(service.runSerialEnrichmentBatch(20)).resolves.toMatchObject({ status: "superseded", steps: 1 });
    expect(repository.publishSerialEnrichment).toHaveBeenCalledOnce();
    expect(repository.failSerialEnrichment).not.toHaveBeenCalled();
  });
});
