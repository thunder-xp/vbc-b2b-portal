import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/src/lib/supabase/admin";

import type { LocalizationRepository } from "./localization.repository";
import type { LocalizationWorkbenchPage } from "./types";

const uuid = z.string().uuid();
const item = z.object({
  id: uuid,
  sku: z.string().nullable(),
  source_name: z.string(),
  source_description: z.string().nullable(),
  current_hash: z.string().regex(/^[0-9a-f]{64}$/),
  localization_id: uuid.nullable(),
  localized_name: z.string().nullable(),
  localized_description: z.string().nullable(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
  translation_status: z.enum(["machine_draft", "reviewed", "outdated"]).nullable(),
  source_hash: z.string().nullable(),
  outdated_against_hash: z.string().nullable(),
  translation_version: z.coerce.number().int().positive().nullable(),
  revision: z.coerce.number().int().positive().nullable(),
  translated_at: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  machine_draft_content: z.object({
    localizedName: z.string().nullable(), shortDescription: z.string().nullable().optional(),
    description: z.string().nullable().optional(), intro: z.string().nullable().optional(),
    seoTitle: z.string().nullable(), seoDescription: z.string().nullable(),
  }).passthrough().nullable(),
  effective_status: z.enum(["missing", "machine_draft", "reviewed", "outdated"]),
  sort_order: z.number().optional(),
}).passthrough();
const summary = z.object({
  missingProducts: z.coerce.number().int().nonnegative(),
  machineDraftProducts: z.coerce.number().int().nonnegative(),
  reviewedProducts: z.coerce.number().int().nonnegative(),
  outdatedProducts: z.coerce.number().int().nonnegative(),
  missingCategories: z.coerce.number().int().nonnegative(),
  machineDraftCategories: z.coerce.number().int().nonnegative(),
  reviewedCategories: z.coerce.number().int().nonnegative(),
  outdatedCategories: z.coerce.number().int().nonnegative(),
  queuedJobs: z.coerce.number().int().nonnegative(),
  failedJobs: z.coerce.number().int().nonnegative(),
  lastRun: z.object({
    status: z.string(), claimed_count: z.coerce.number(), completed_count: z.coerce.number(),
    failed_count: z.coerce.number(), stale_count: z.coerce.number(), duration_ms: z.coerce.number().nullable(),
    started_at: z.string(), completed_at: z.string().nullable(),
  }).passthrough().nullable(),
}).strict();
const workbench = z.object({ items: z.array(item).max(50), totalCount: z.coerce.number(), summary }).strict();
const batch = z.object({
  runId: uuid,
  jobs: z.array(z.object({
    id: uuid, entityType: z.enum(["product", "category"]), entityId: uuid,
    locale: z.string(), sourceHash: z.string().regex(/^[0-9a-f]{64}$/), source: z.record(z.string(), z.unknown()),
  }).strict()).max(25),
  terminology: z.record(z.string(), z.string()),
}).strict();

export class SupabaseLocalizationRepository implements LocalizationRepository {
  async getWorkbench(input: Parameters<LocalizationRepository["getWorkbench"]>[0]): Promise<LocalizationWorkbenchPage> {
    const { data, error } = await createAdminClient().rpc("get_portal_localization_workbench", {
      p_entity_type: input.entityType, p_locale: input.locale, p_status: input.status ?? null,
      p_search: input.search ?? null, p_limit: input.pageSize, p_offset: (input.page - 1) * input.pageSize,
    });
    if (error) throw repositoryError(error.code);
    const parsed = workbench.parse(data);
    return {
      items: parsed.items.map((row) => ({
        id: row.id, sku: row.sku, sourceName: row.source_name, sourceDescription: row.source_description,
        currentHash: row.current_hash, localizationId: row.localization_id, localizedName: row.localized_name,
        localizedDescription: row.localized_description, seoTitle: row.seo_title, seoDescription: row.seo_description,
        translationStatus: row.translation_status, sourceHash: row.source_hash,
        outdatedAgainstHash: row.outdated_against_hash, translationVersion: row.translation_version,
        revision: row.revision, translatedAt: row.translated_at, reviewedAt: row.reviewed_at,
        machineDraftContent: row.machine_draft_content,
        effectiveStatus: row.effective_status,
      })),
      totalCount: parsed.totalCount, page: input.page, pageSize: input.pageSize, summary: parsed.summary,
    };
  }

  async manage(input: Parameters<LocalizationRepository["manage"]>[0]) {
    const { data, error } = await createAdminClient().rpc("manage_portal_localization", {
      p_entity_type: input.entityType, p_entity_id: input.entityId, p_locale: input.locale,
      p_action: input.action, p_source_hash: input.sourceHash, p_expected_revision: input.expectedRevision,
      p_content: input.content, p_actor_user_id: input.actorUserId,
    });
    if (error) throw repositoryError(error.code);
    return z.object({ revision: z.coerce.number(), translationVersion: z.coerce.number(), status: z.string() }).parse(data);
  }

  async requestRetranslation(input: Parameters<LocalizationRepository["requestRetranslation"]>[0]) {
    const { error } = await createAdminClient().rpc("request_portal_localization_retranslation", {
      p_entity_type: input.entityType, p_entity_id: input.entityId, p_locale: input.locale,
      p_actor_user_id: input.actorUserId,
    });
    if (error) throw repositoryError(error.code);
  }

  async claim(locale: string, limit: number) {
    const { data, error } = await createAdminClient().rpc("claim_portal_localization_jobs", { p_locale: locale, p_limit: limit });
    if (error) throw repositoryError(error.code);
    return batch.parse(data);
  }

  async completeJob(input: Parameters<LocalizationRepository["completeJob"]>[0]) {
    const { data, error } = await createAdminClient().rpc("complete_portal_localization_job", {
      p_job_id: input.jobId, p_source_hash: input.sourceHash, p_content: input.content,
      p_provider_metadata: input.providerMetadata,
    });
    if (error) throw repositoryError(error.code);
    return z.object({ applied: z.boolean(), stale: z.boolean().optional() }).passthrough().parse(data);
  }

  async failJob(jobId: string, safeErrorCode: string) {
    const { error } = await createAdminClient().rpc("fail_portal_localization_job", { p_job_id: jobId, p_safe_error_code: safeErrorCode });
    if (error) throw repositoryError(error.code);
  }

  async completeRun(input: Parameters<LocalizationRepository["completeRun"]>[0]) {
    const { error } = await createAdminClient().rpc("complete_portal_localization_run", {
      p_run_id: input.runId, p_completed: input.completed, p_failed: input.failed,
      p_stale: input.stale, p_applied: input.applied, p_duration_ms: input.durationMs,
      p_safe_error_code: input.safeErrorCode ?? null,
    });
    if (error) throw repositoryError(error.code);
  }

  async requestPublication(locale: string) {
    const { error } = await createAdminClient().rpc("request_portal_localization_publication", { p_locale: locale });
    if (error) throw repositoryError(error.code);
  }

  async claimPublication(locale: string) {
    const { data, error } = await createAdminClient().rpc("claim_portal_localization_publication", { p_locale: locale });
    if (error) throw repositoryError(error.code);
    return z.object({ runId: uuid.nullable() }).parse(data).runId;
  }

  async completePublication(runId: string, succeeded: boolean, safeErrorCode?: string) {
    const { error } = await createAdminClient().rpc("complete_portal_localization_publication", {
      p_run_id: runId, p_succeeded: succeeded, p_safe_error_code: safeErrorCode ?? null,
    });
    if (error) throw repositoryError(error.code);
  }
}

function repositoryError(code?: string | null) {
  return Object.assign(new Error("Localization repository operation failed."), {
    name: "LocalizationRepositoryError", code: code ?? "unknown",
  });
}
