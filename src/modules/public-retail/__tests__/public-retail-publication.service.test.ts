import { describe, expect, it, vi } from "vitest";

import type { PublicRetailPublicationRepository } from "../repositories/public-retail.repository";
import { PublicRetailPublicationService } from "../services/public-retail-publication.service";

const publicationId = "8d4fe3a1-3d8a-4fa0-9b0c-87df948fe07f";
const checksum = "a".repeat(64);

describe("PublicRetailPublicationService", () => {
  it("builds and atomically publishes the validated candidate", async () => {
    const repository = {
      start: vi.fn().mockResolvedValue(publicationId),
      build: vi.fn().mockResolvedValue({
        publicationId, sourceProducts: 10, eligibleProducts: 8, excludedProducts: 2,
        missingRetail: 2, missingImage: 1, missingCategory: 0,
        productsWithStructuredSpecifications: 7, checksum,
      }),
      publish: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    } satisfies PublicRetailPublicationRepository;

    const result = await new PublicRetailPublicationService(repository).publishCurrentProjection();

    expect(result.checksum).toBe(checksum);
    expect(repository.publish).toHaveBeenCalledWith(publicationId, checksum);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("marks only the candidate failed and never retries publication", async () => {
    const repository = {
      start: vi.fn().mockResolvedValue(publicationId),
      build: vi.fn().mockRejectedValue(new Error("source failed")),
      publish: vi.fn(),
      fail: vi.fn().mockResolvedValue(undefined),
    } satisfies PublicRetailPublicationRepository;

    await expect(new PublicRetailPublicationService(repository).publishCurrentProjection()).rejects.toThrow("source failed");
    expect(repository.fail).toHaveBeenCalledOnce();
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it("does not overwrite database-recorded candidate diagnostics", async () => {
    const failure = Object.assign(new Error("candidate failed"), { candidateFailureRecorded: true });
    const repository = {
      start: vi.fn().mockResolvedValue(publicationId),
      build: vi.fn().mockRejectedValue(failure),
      publish: vi.fn(),
      fail: vi.fn(),
    } satisfies PublicRetailPublicationRepository;

    await expect(new PublicRetailPublicationService(repository).publishCurrentProjection()).rejects.toBe(failure);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("preserves the original publication failure when failure recording also fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = new Error("build failed");
    const repository = {
      start: vi.fn().mockResolvedValue(publicationId),
      build: vi.fn().mockRejectedValue(original),
      publish: vi.fn(),
      fail: vi.fn().mockRejectedValue(Object.assign(new Error("audit failed"), { name: "FailureRecordingError" })),
    } satisfies PublicRetailPublicationRepository;

    await expect(new PublicRetailPublicationService(repository).publishCurrentProjection()).rejects.toBe(original);
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({
      event: "public_retail_candidate_failure_recording_failed",
      publicationId,
      errorType: "FailureRecordingError",
    }));
  });
});
