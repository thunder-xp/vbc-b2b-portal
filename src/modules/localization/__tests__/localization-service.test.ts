import { describe, expect, it, vi } from "vitest";

import { FakeLocalizationTranslationProvider } from "../fake-translation-provider";
import type { LocalizationRepository } from "../localization.repository";
import { LocalizationService } from "../localization.service";

function repository(): LocalizationRepository {
  return {
    getWorkbench: vi.fn(), exportRows: vi.fn(), previewImport: vi.fn(), importRows: vi.fn(),
    manage: vi.fn(), requestRetranslation: vi.fn(),
    claim: vi.fn().mockResolvedValue({
      runId: "10000000-0000-4000-8000-000000000001",
      terminology: { "Разрешение": "Rezoluție" },
      jobs: [
        { id: "10000000-0000-4000-8000-000000000002", entityType: "product", entityId: "10000000-0000-4000-8000-000000000003", locale: "ro", sourceHash: "a".repeat(64), source: { name: "Camera IPC-HFW2441T-ZS 4MP", description: "Descriere" } },
        { id: "10000000-0000-4000-8000-000000000004", entityType: "category", entityId: "10000000-0000-4000-8000-000000000005", locale: "ro", sourceHash: "b".repeat(64), source: { name: "Камеры", description: "Описание" } },
      ],
    }),
    completeJob: vi.fn().mockResolvedValue({ applied: true, stale: false }),
    failJob: vi.fn(), completeRun: vi.fn(), requestPublication: vi.fn(),
    claimPublication: vi.fn().mockResolvedValue("10000000-0000-4000-8000-000000000007"),
    completePublication: vi.fn(),
  };
}

describe("LocalizationService", () => {
  it("processes a bounded batch and publishes once", async () => {
    const repo = repository();
    const publisher = { publishCurrentProjection: vi.fn().mockResolvedValue({ publicationId: "10000000-0000-4000-8000-000000000006", checksum: "c".repeat(64), durationMs: 45 }) };
    const service = new LocalizationService(repo, new FakeLocalizationTranslationProvider(), publisher);
    const result = await service.processBatch(10);
    expect(result).toMatchObject({ status: "succeeded", processed: 2, completed: 2, failed: 0 });
    expect(repo.completeJob).toHaveBeenCalledTimes(2);
    expect(repo.completeRun).toHaveBeenCalledTimes(1);
    expect(publisher.publishCurrentProjection).toHaveBeenCalledTimes(1);
  });

  it("does not claim work or publish when no provider is configured", async () => {
    const repo = repository();
    vi.mocked(repo.claimPublication).mockResolvedValue(null);
    const publisher = { publishCurrentProjection: vi.fn() };
    const service = new LocalizationService(repo, undefined, publisher);
    await expect(service.processBatch()).resolves.toEqual({ status: "provider_unconfigured", processed: 0, publication: null });
    expect(repo.claim).not.toHaveBeenCalled();
    expect(publisher.publishCurrentProjection).not.toHaveBeenCalled();
  });

  it("isolates a failed job and completes the batch without a publication storm", async () => {
    const repo = repository();
    const provider = new FakeLocalizationTranslationProvider((name) => {
      if (name === "Камеры") throw Object.assign(new Error("failed"), { safeCode: "TEST_FAILURE" });
      return name;
    });
    const publisher = { publishCurrentProjection: vi.fn().mockResolvedValue({ publicationId: "10000000-0000-4000-8000-000000000006", checksum: "c".repeat(64), durationMs: 45 }) };
    const result = await new LocalizationService(repo, provider, publisher).processBatch();
    expect(result).toMatchObject({ status: "partial_success", completed: 1, failed: 1 });
    expect(repo.failJob).toHaveBeenCalledTimes(1);
    expect(publisher.publishCurrentProjection).toHaveBeenCalledTimes(1);
  });

  it("retains a failed publication for a later bounded retry", async () => {
    const repo = repository();
    const publisher = { publishCurrentProjection: vi.fn().mockRejectedValue(new Error("temporary")) };
    const result = await new LocalizationService(repo, new FakeLocalizationTranslationProvider(), publisher).processBatch();
    expect(result.publication).toBeNull();
    expect(repo.completePublication).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000007", false, "ERROR",
    );
  });

  it("does not republish when a translated revision preserves current reviewed content", async () => {
    const repo = repository();
    vi.mocked(repo.completeJob).mockResolvedValue({ applied: false, stale: false });
    vi.mocked(repo.claimPublication).mockResolvedValue(null);
    const publisher = { publishCurrentProjection: vi.fn() };
    const result = await new LocalizationService(repo, new FakeLocalizationTranslationProvider(), publisher).processBatch();
    expect(result).toMatchObject({ completed: 2, applied: 0 });
    expect(publisher.publishCurrentProjection).not.toHaveBeenCalled();
  });

  it("parses a bounded manual JSON import without accepting missing identities", () => {
    const service = new LocalizationService(repository());
    const row = {
      entityType: "product", entityId: "10000000-0000-4000-8000-000000000003", entityReference: "400448",
      sku: "400448", locale: "ro", sourceName: "Camera", sourceHash: "a".repeat(64),
      localizedName: "Cameră", shortDescription: "Descriere scurtă", description: "Descriere",
      seoTitle: "Cameră | Novotech", seoDescription: "Cameră de supraveghere.", status: "reviewed",
    };
    expect(service.parseImport(JSON.stringify([row]))).toEqual([row]);
    expect(() => service.parseImport(JSON.stringify([{ ...row, entityId: "" }]))).toThrow("Localization input is invalid.");
    expect(() => service.parseImport(JSON.stringify(Array.from({ length: 101 }, () => row)))).toThrow();
  });

  it("uses a bounded export for the first product wave", async () => {
    const repo = repository();
    vi.mocked(repo.exportRows).mockResolvedValue([]);
    const service = new LocalizationService(repo);
    await service.exportRows({ entityType: "product", limit: 500 });
    expect(repo.exportRows).toHaveBeenCalledWith({ entityType: "product", locale: "ro", status: undefined, limit: 100 });
  });

  it("keeps the manual workbench independent of optional machine draft history", async () => {
    const repo = repository();
    vi.mocked(repo.getWorkbench).mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 20,
      summary: { missingProducts: 0, machineDraftProducts: 0, reviewedProducts: 0, outdatedProducts: 0,
        missingCategories: 0, machineDraftCategories: 0, reviewedCategories: 0, outdatedCategories: 0,
        queuedJobs: 0, failedJobs: 0, lastRun: null } });
    await expect(new LocalizationService(repo).listWorkbench({})).resolves.toMatchObject({ items: [] });
  });
});
