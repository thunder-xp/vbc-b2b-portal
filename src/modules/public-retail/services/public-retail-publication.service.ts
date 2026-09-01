import type { PublicRetailPublicationRepository } from "../repositories/public-retail.repository";

export class PublicRetailPublicationService {
  constructor(private readonly repository: PublicRetailPublicationRepository) {}

  async publishCurrentProjection() {
    const startedAt = performance.now();
    const publicationId = await this.repository.start();
    try {
      const metrics = await this.repository.build(publicationId);
      await this.repository.publish(publicationId, metrics.checksum);
      return { ...metrics, durationMs: Math.round((performance.now() - startedAt) * 100) / 100 };
    } catch (error) {
      if (!candidateFailureAlreadyRecorded(error)) {
        try {
          await this.repository.fail(publicationId, safeFailure(error));
        } catch (failureError) {
          console.error({
            event: "public_retail_candidate_failure_recording_failed",
            publicationId,
            errorType: failureError instanceof Error ? failureError.name : typeof failureError,
          });
        }
      }
      throw error;
    }
  }
}

function safeFailure(error: unknown): string {
  return error instanceof Error && error.name ? `PUBLIC_RETAIL_PUBLICATION_FAILED:${error.name}` : "PUBLIC_RETAIL_PUBLICATION_FAILED";
}

function candidateFailureAlreadyRecorded(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "candidateFailureRecorded" in error && error.candidateFailureRecorded === true);
}
