import "server-only";

import type { PublicRetailProjectionPublisher } from "../integration/sync/catalog-synchronization-orchestrator";
import type { LocalizationRepository } from "./localization.repository";
import type { LocalizationTranslationProvider } from "./translation-provider";
import type { LocalizationContent, LocalizationEntityType, LocalizationMutationAction, LocalizationStatus } from "./types";

export class LocalizationService {
  constructor(
    private readonly repository: LocalizationRepository,
    private readonly provider?: LocalizationTranslationProvider,
    private readonly publisher?: PublicRetailProjectionPublisher,
  ) {}

  listWorkbench(input: { entityType?: string; status?: string; search?: string; page?: number }) {
    const entityType: LocalizationEntityType = input.entityType === "product" ? "product" : "category";
    const status = isStatus(input.status) ? input.status : undefined;
    return this.repository.getWorkbench({
      entityType, locale: "ro", status, search: input.search?.trim().slice(0, 100) || undefined,
      page: positiveInteger(input.page, 1), pageSize: 20,
    });
  }

  save(input: {
    entityType: LocalizationEntityType; entityId: string; action: LocalizationMutationAction;
    sourceHash: string; expectedRevision: number; content: LocalizationContent; actorUserId: string;
  }) {
    validateMutation(input);
    return this.repository.manage({ ...input, locale: "ro", content: normalizeContent(input.content) });
  }

  requestRetranslation(entityType: LocalizationEntityType, entityId: string, actorUserId: string) {
    if (!isUuid(entityId) || !isUuid(actorUserId)) throw new LocalizationValidationError();
    return this.repository.requestRetranslation({ entityType, entityId, locale: "ro", actorUserId });
  }

  requestPublication() {
    return this.repository.requestPublication("ro");
  }

  async processBatch(limit = 10) {
    if (!this.provider) {
      const publication = await this.publishPending();
      return { status: "provider_unconfigured" as const, processed: 0, publication };
    }
    const startedAt = performance.now();
    const batch = await this.repository.claim("ro", Math.min(Math.max(Math.floor(limit), 1), 10));
    let completed = 0;
    let failed = 0;
    let stale = 0;
    let applied = 0;

    for (let offset = 0; offset < batch.jobs.length; offset += 3) {
      const slice = batch.jobs.slice(offset, offset + 3);
      await Promise.all(slice.map(async (job) => {
        try {
          const translation = await this.provider!.translate({ ...job, sourceLocale: "ru", terminology: batch.terminology });
          const result = await this.repository.completeJob({
            jobId: job.id, sourceHash: job.sourceHash, content: translation.content,
            providerMetadata: translation.providerMetadata,
          });
          if (result.stale) stale += 1;
          else {
            completed += 1;
            if (result.applied) applied += 1;
          }
        } catch (error) {
          failed += 1;
          await this.repository.failJob(job.id, safeProviderCode(error));
        }
      }));
    }

    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    await this.repository.completeRun({ runId: batch.runId, completed, failed, stale, applied, durationMs });
    const publication = await this.publishPending();
    return { status: failed ? "partial_success" as const : "succeeded" as const, processed: batch.jobs.length,
      completed, failed, stale, applied, durationMs, publication };
  }

  private async publishPending() {
    if (!this.publisher) return null;
    const runId = await this.repository.claimPublication("ro");
    if (!runId) return null;
    try {
      const publication = await this.publisher.publishCurrentProjection();
      await this.repository.completePublication(runId, true);
      return publication;
    } catch (error) {
      await this.repository.completePublication(runId, false, safePublicationCode(error));
      return null;
    }
  }
}

export class LocalizationValidationError extends Error {
  constructor() { super("Localization input is invalid."); this.name = "LocalizationValidationError"; }
}

function normalizeContent(content: LocalizationContent): LocalizationContent {
  const clean = (value: string | null | undefined, max: number) => value?.trim().slice(0, max) || null;
  return {
    localizedName: clean(content.localizedName, 500),
    shortDescription: clean(content.shortDescription, 2000),
    description: clean(content.description, 50_000),
    intro: clean(content.intro, 10_000),
    seoTitle: clean(content.seoTitle, 200),
    seoDescription: clean(content.seoDescription, 500),
  };
}

function validateMutation(input: Parameters<LocalizationService["save"]>[0]) {
  if (!isUuid(input.entityId) || !isUuid(input.actorUserId) || !/^[0-9a-f]{64}$/.test(input.sourceHash)
    || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new LocalizationValidationError();
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function positiveInteger(value: number | undefined, fallback: number) { return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback; }
function isStatus(value?: string): value is LocalizationStatus { return ["missing","machine_draft","reviewed","outdated"].includes(value ?? ""); }
function safeProviderCode(error: unknown) {
  const candidate = error && typeof error === "object" && "safeCode" in error ? String(error.safeCode) : "TRANSLATION_PROVIDER_FAILED";
  return candidate.replace(/[^A-Z0-9_]/gi, "_").toUpperCase().slice(0, 120);
}
function safePublicationCode(error: unknown) {
  const name = error instanceof Error ? error.name : "LOCALIZATION_PUBLICATION_FAILED";
  return name.replace(/[^A-Z0-9_]/gi, "_").toUpperCase().slice(0, 120);
}
