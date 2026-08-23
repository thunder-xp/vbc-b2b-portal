import "server-only";

import type { PublicRetailPublicationMetrics } from "../../public-retail/types";

export type CatalogSynchronizationSourceDomain = "catalog" | "prices" | "stock";
export type CatalogSynchronizationTrigger = "manual" | "scheduled";
export type CatalogSynchronizationChangedCounts = Record<string, number>;

export type CatalogProjectionOutcome = {
  runId: string | null;
  sourceDomain: CatalogSynchronizationSourceDomain | null;
  trigger: CatalogSynchronizationTrigger | null;
  status: "succeeded" | "partial_success" | "queued" | "already_completed" | "no_pending";
  publicationId: string | null;
  checksum: string | null;
  durationMs: number | null;
  safeErrorCode: string | null;
};

export interface CatalogSynchronizationRunRepository {
  register(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    trigger: CatalogSynchronizationTrigger;
  }): Promise<void>;
  completeSource(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    changedCounts: CatalogSynchronizationChangedCounts;
    sourceDurationMs: number;
  }): Promise<void>;
  failSource(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    safeErrorCode: string;
  }): Promise<void>;
  claim(input?: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
  }): Promise<{
    claimed: boolean;
    status: string;
    runId: string | null;
    sourceDomain: CatalogSynchronizationSourceDomain | null;
    trigger: CatalogSynchronizationTrigger | null;
    publicationId: string | null;
  }>;
  completeProjection(input: {
    runId: string;
    publicationId: string;
    checksum: string;
    durationMs: number;
  }): Promise<void>;
  failProjection(input: {
    runId: string;
    safeErrorCode: string;
    durationMs: number;
  }): Promise<void>;
}

export interface PublicRetailProjectionPublisher {
  publishCurrentProjection(): Promise<PublicRetailPublicationMetrics & { durationMs: number }>;
}

export interface PublicRetailCacheInvalidator {
  invalidateAfterPublication(): Promise<void> | void;
}

export class CatalogSynchronizationOrchestrator {
  constructor(
    private readonly repository: CatalogSynchronizationRunRepository,
    private readonly publisher: PublicRetailProjectionPublisher,
    private readonly cacheInvalidator: PublicRetailCacheInvalidator,
  ) {}

  registerSourceRun(
    sourceSyncId: string,
    sourceDomain: CatalogSynchronizationSourceDomain,
    trigger: CatalogSynchronizationTrigger,
  ): Promise<void> {
    return this.repository.register({ sourceSyncId, sourceDomain, trigger });
  }

  async completeSourceSync(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    changedCounts: CatalogSynchronizationChangedCounts;
    sourceDurationMs: number;
  }): Promise<CatalogProjectionOutcome> {
    try {
      await this.repository.completeSource(input);
      return await this.publishClaimedProjection({
        sourceSyncId: input.sourceSyncId,
        sourceDomain: input.sourceDomain,
      });
    } catch (error) {
      logOrchestrationFailure("catalog_projection_orchestration_failed", error);
      return partialOutcome(input.sourceDomain, "CATALOG_PROJECTION_ORCHESTRATION_FAILED");
    }
  }

  async failSourceSync(
    sourceSyncId: string,
    sourceDomain: CatalogSynchronizationSourceDomain,
    safeErrorCode: string,
  ): Promise<void> {
    try {
      await this.repository.failSource({ sourceSyncId, sourceDomain, safeErrorCode });
    } catch (error) {
      logOrchestrationFailure("catalog_source_failure_audit_failed", error);
    }
  }

  resumePendingProjection(): Promise<CatalogProjectionOutcome> {
    return this.publishClaimedProjection();
  }

  private async publishClaimedProjection(input?: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
  }): Promise<CatalogProjectionOutcome> {
    const claim = await this.repository.claim(input);
    if (!claim.claimed || !claim.runId) {
      return {
        runId: claim.runId,
        sourceDomain: claim.sourceDomain,
        trigger: claim.trigger,
        status: claim.status === "already_completed" ? "already_completed" : claim.status === "queued" ? "queued" : "no_pending",
        publicationId: claim.publicationId,
        checksum: null,
        durationMs: null,
        safeErrorCode: null,
      };
    }

    const startedAt = performance.now();
    try {
      const publication = await this.publisher.publishCurrentProjection();
      await this.repository.completeProjection({
        runId: claim.runId,
        publicationId: publication.publicationId,
        checksum: publication.checksum,
        durationMs: Math.max(0, Math.round(publication.durationMs)),
      });
      await this.cacheInvalidator.invalidateAfterPublication();
      return {
        runId: claim.runId,
        sourceDomain: claim.sourceDomain,
        trigger: claim.trigger,
        status: "succeeded",
        publicationId: publication.publicationId,
        checksum: publication.checksum,
        durationMs: Math.max(0, Math.round(publication.durationMs)),
        safeErrorCode: null,
      };
    } catch (error) {
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      const safeErrorCode = safeProjectionErrorCode(error);
      try {
        await this.repository.failProjection({ runId: claim.runId, safeErrorCode, durationMs });
      } catch (persistenceError) {
        logOrchestrationFailure("catalog_projection_failure_audit_failed", persistenceError);
      }
      return {
        runId: claim.runId,
        sourceDomain: claim.sourceDomain,
        trigger: claim.trigger,
        status: "partial_success",
        publicationId: null,
        checksum: null,
        durationMs,
        safeErrorCode,
      };
    }
  }
}

function safeProjectionErrorCode(error: unknown): string {
  if (error instanceof Error && error.name) {
    return `PUBLIC_RETAIL_PUBLICATION_${error.name.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`.slice(0, 120);
  }
  return "PUBLIC_RETAIL_PUBLICATION_FAILED";
}

function partialOutcome(
  sourceDomain: CatalogSynchronizationSourceDomain,
  safeErrorCode: string,
): CatalogProjectionOutcome {
  return {
    runId: null,
    sourceDomain,
    trigger: null,
    status: "partial_success",
    publicationId: null,
    checksum: null,
    durationMs: null,
    safeErrorCode,
  };
}

function logOrchestrationFailure(event: string, error: unknown): void {
  console.error({ event, errorType: error instanceof Error ? error.name : typeof error });
}
