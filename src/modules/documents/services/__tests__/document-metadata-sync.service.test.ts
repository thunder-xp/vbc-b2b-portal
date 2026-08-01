import { describe, expect, it, vi } from "vitest";

import { ONE_C_DOCUMENT_SOURCES, type OneCDocumentODataProvider } from "../../../integration/providers/one-c";
import { DocumentMetadataSyncService, type DocumentSyncRepository } from "../document-metadata-sync.service";

describe("DocumentMetadataSyncService", () => {
  it("stages every verified source and publishes only after the complete scan", async () => {
    const repository = repositoryFixture();
    const provider = providerFixture();
    const result = await new DocumentMetadataSyncService(repository, provider).run(20);
    expect(provider.fetchSourcePage).toHaveBeenCalledTimes(ONE_C_DOCUMENT_SOURCES.length);
    expect(repository.stagePage).toHaveBeenCalledTimes(ONE_C_DOCUMENT_SOURCES.length);
    expect(repository.publish).toHaveBeenCalledOnce();
    expect(result.completed).toBe(true);
  });

  it("releases the lease and preserves staging when the page budget is exhausted", async () => {
    const repository = repositoryFixture();
    const result = await new DocumentMetadataSyncService(repository, providerFixture()).run(2);
    expect(result.completed).toBe(false);
    expect(repository.release).toHaveBeenCalledWith(syncId);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it("does no source or database work when another invocation owns the lease", async () => {
    const repository = repositoryFixture({ locked: true });
    const provider = providerFixture();
    const result = await new DocumentMetadataSyncService(repository, provider).run();
    expect(result.pagesProcessed).toBe(0);
    expect(provider.fetchSourcePage).not.toHaveBeenCalled();
    expect(repository.stagePage).not.toHaveBeenCalled();
  });

  it("marks the run failed without publishing a partial snapshot", async () => {
    const repository = repositoryFixture();
    const provider = providerFixture();
    provider.fetchSourcePage.mockRejectedValueOnce(new Error("1C unavailable"));
    await expect(new DocumentMetadataSyncService(repository, provider).run()).rejects.toThrow("1C unavailable");
    expect(repository.fail).toHaveBeenCalledWith(syncId, "error");
    expect(repository.publish).not.toHaveBeenCalled();
  });
});

const syncId = "11111111-1111-4111-8111-111111111111";
function repositoryFixture(lease: Partial<Awaited<ReturnType<DocumentSyncRepository["beginOrResume"]>>> = {}): DocumentSyncRepository {
  return {
    beginOrResume: vi.fn().mockResolvedValue({ syncId, sourceIndex: 0, nextSkip: 0, resumed: false, locked: false, ...lease }),
    stagePage: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ published: 5, mapped: 5, unmapped: 0, linkedOrders: 1, unlinkedOrders: 0 }),
    release: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}
function providerFixture() {
  return { fetchSourcePage: vi.fn().mockResolvedValue({ items: [], received: 0, rejected: 0, nextSkip: null }) } as unknown as OneCDocumentODataProvider & { fetchSourcePage: ReturnType<typeof vi.fn> };
}
