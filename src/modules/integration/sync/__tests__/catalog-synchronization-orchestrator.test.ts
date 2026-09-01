import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CatalogSynchronizationOrchestrator,
  type CatalogSynchronizationRunRepository,
} from "../catalog-synchronization-orchestrator";

describe("CatalogSynchronizationOrchestrator", () => {
  const repository = repositoryFixture();
  const publisher = { publishCurrentProjection: vi.fn() };
  const cache = { invalidateAfterPublication: vi.fn() };
  const service = new CatalogSynchronizationOrchestrator(repository, publisher, cache);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.claim.mockResolvedValue(claimed);
    publisher.publishCurrentProjection.mockResolvedValue(publication);
  });

  it("publishes one atomic Public Retail projection after B2B source success", async () => {
    const result = await service.completeSourceSync(sourceCompletion);
    expect(repository.completeSource).toHaveBeenCalledWith(sourceCompletion);
    expect(repository.claim).toHaveBeenCalledWith({ sourceSyncId, sourceDomain: "prices" });
    expect(publisher.publishCurrentProjection).toHaveBeenCalledOnce();
    expect(repository.completeProjection).toHaveBeenCalledWith({ runId, publicationId, checksum, durationMs: 125 });
    expect(cache.invalidateAfterPublication).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "succeeded", publicationId, checksum });
  });

  it("reports Public Retail failure as partial success without changing B2B source success", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    publisher.publishCurrentProjection.mockRejectedValueOnce(Object.assign(new Error("failed"), {
      name: "PublicRetailRepositoryError",
      operation: "candidate_build",
      rpcName: "build_public_retail_candidate",
      sqlState: "57014",
      constraint: null,
      publicationId,
      entityContext: { entity: "public_retail_publication", publicationId },
    }));
    const result = await service.completeSourceSync(sourceCompletion);
    expect(repository.completeSource).toHaveBeenCalledOnce();
    expect(repository.failProjection).toHaveBeenCalledWith(expect.objectContaining({ runId, safeErrorCode: "PUBLIC_RETAIL_PUBLICATION_PUBLICRETAILREPOSITORYERROR" }));
    expect(cache.invalidateAfterPublication).not.toHaveBeenCalled();
    expect(result.status).toBe("partial_success");
    expect(errorLog).toHaveBeenCalledWith({
      event: "catalog_public_projection_failed",
      runId,
      publicationId,
      operation: "candidate_build",
      rpcName: "build_public_retail_candidate",
      sqlState: "57014",
      constraint: null,
      entityContext: { entity: "public_retail_publication", publicationId },
      errorType: "PublicRetailRepositoryError",
    });
  });

  it("does not relabel a completed B2B source when orchestration persistence fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    repository.completeSource.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { name: "RepositoryUnavailable" }));
    const result = await service.completeSourceSync(sourceCompletion);
    expect(result).toMatchObject({ status: "partial_success", safeErrorCode: "CATALOG_PROJECTION_ORCHESTRATION_FAILED" });
    expect(publisher.publishCurrentProjection).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ event: "catalog_projection_orchestration_failed", errorType: "RepositoryUnavailable" }));
  });

  it("queues overlapping source completions without starting a duplicate snapshot", async () => {
    repository.claim.mockResolvedValueOnce({ ...claimed, claimed: false, status: "queued", publicationId: null });
    const result = await service.completeSourceSync(sourceCompletion);
    expect(result.status).toBe("queued");
    expect(publisher.publishCurrentProjection).not.toHaveBeenCalled();
  });

  it("returns an idempotent completed result without republishing", async () => {
    repository.claim.mockResolvedValueOnce({ ...claimed, claimed: false, status: "already_completed", publicationId });
    const result = await service.completeSourceSync(sourceCompletion);
    expect(result).toMatchObject({ status: "already_completed", publicationId });
    expect(publisher.publishCurrentProjection).not.toHaveBeenCalled();
  });

  it("drains one pending projection through the same publication method", async () => {
    await service.resumePendingProjection();
    expect(repository.claim).toHaveBeenCalledWith(undefined);
    expect(publisher.publishCurrentProjection).toHaveBeenCalledOnce();
  });
});

const sourceSyncId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const publicationId = "33333333-3333-4333-8333-333333333333";
const checksum = "a".repeat(64);
const claimed = { claimed: true, status: "running", runId, sourceDomain: "prices" as const, trigger: "scheduled" as const, publicationId: null };
const publication = { publicationId, checksum, durationMs: 125, sourceProducts: 20, eligibleProducts: 18, excludedProducts: 2, missingRetail: 0, missingImage: 1, missingCategory: 0, productsWithStructuredSpecifications: 17 };
const sourceCompletion = { sourceSyncId, sourceDomain: "prices" as const, changedCounts: { prices: 100 }, sourceDurationMs: 800 };

function repositoryFixture() {
  return {
    register: vi.fn(async () => undefined),
    completeSource: vi.fn(async () => undefined),
    failSource: vi.fn(async () => undefined),
    claim: vi.fn(),
    completeProjection: vi.fn(async () => undefined),
    failProjection: vi.fn(async () => undefined),
  } satisfies CatalogSynchronizationRunRepository;
}
