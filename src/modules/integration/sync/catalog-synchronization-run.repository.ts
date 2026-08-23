import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../../lib/supabase/admin";
import type {
  CatalogSynchronizationRunRepository,
  CatalogSynchronizationSourceDomain,
  CatalogSynchronizationTrigger,
} from "./catalog-synchronization-orchestrator";

const claimResult = z.object({
  claimed: z.boolean(),
  status: z.string().min(1).max(40),
  runId: z.string().uuid().nullable().optional(),
  sourceDomain: z.enum(["catalog", "prices", "stock"]).nullable().optional(),
  trigger: z.enum(["manual", "scheduled"]).nullable().optional(),
  publicationId: z.string().uuid().nullable().optional(),
}).passthrough();

export class SupabaseCatalogSynchronizationRunRepository implements CatalogSynchronizationRunRepository {
  async register(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    trigger: CatalogSynchronizationTrigger;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("register_catalog_synchronization_run", {
      p_source_sync_id: input.sourceSyncId,
      p_source_domain: input.sourceDomain,
      p_trigger_kind: input.trigger,
    });
    if (error) throw repositoryError(error);
  }

  async completeSource(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    changedCounts: Record<string, number>;
    sourceDurationMs: number;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("complete_catalog_synchronization_source", {
      p_source_sync_id: input.sourceSyncId,
      p_source_domain: input.sourceDomain,
      p_changed_counts: input.changedCounts,
      p_source_duration_ms: input.sourceDurationMs,
    });
    if (error) throw repositoryError(error);
  }

  async failSource(input: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
    safeErrorCode: string;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_catalog_synchronization_source", {
      p_source_sync_id: input.sourceSyncId,
      p_source_domain: input.sourceDomain,
      p_safe_error_code: input.safeErrorCode,
    });
    if (error) throw repositoryError(error);
  }

  async claim(input?: {
    sourceSyncId: string;
    sourceDomain: CatalogSynchronizationSourceDomain;
  }) {
    const { data, error } = await createAdminClient().rpc("claim_catalog_projection_run", {
      p_source_sync_id: input?.sourceSyncId ?? null,
      p_source_domain: input?.sourceDomain ?? null,
    });
    if (error) throw repositoryError(error);
    const parsed = claimResult.parse(data);
    return {
      claimed: parsed.claimed,
      status: parsed.status,
      runId: parsed.runId ?? null,
      sourceDomain: parsed.sourceDomain ?? null,
      trigger: parsed.trigger ?? null,
      publicationId: parsed.publicationId ?? null,
    };
  }

  async completeProjection(input: {
    runId: string;
    publicationId: string;
    checksum: string;
    durationMs: number;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("complete_catalog_projection_run", {
      p_run_id: input.runId,
      p_publication_id: input.publicationId,
      p_checksum: input.checksum,
      p_duration_ms: input.durationMs,
    });
    if (error) throw repositoryError(error);
  }

  async failProjection(input: {
    runId: string;
    safeErrorCode: string;
    durationMs: number;
  }): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_catalog_projection_run", {
      p_run_id: input.runId,
      p_safe_error_code: input.safeErrorCode,
      p_duration_ms: input.durationMs,
    });
    if (error) throw repositoryError(error);
  }
}

function repositoryError(error: { code?: string | null }): Error {
  return Object.assign(new Error("Catalog synchronization orchestration failed."), {
    name: "CatalogSynchronizationRepositoryError",
    code: error.code ?? undefined,
  });
}
