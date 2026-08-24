import "server-only";

import type {
  ClaimedTranslationBatch,
  LocalizationContent,
  LocalizationEntityType,
  LocalizationMutationAction,
  LocalizationStatus,
  LocalizationImportPreview,
  LocalizationTransferRow,
  LocalizationWorkbenchPage,
} from "./types";

export interface LocalizationRepository {
  getWorkbench(input: {
    entityType: LocalizationEntityType;
    locale: string;
    status?: LocalizationStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<LocalizationWorkbenchPage>;
  exportRows(input: {
    entityType: LocalizationEntityType;
    locale: string;
    status?: LocalizationStatus;
    limit: number;
  }): Promise<LocalizationTransferRow[]>;
  previewImport(rows: LocalizationTransferRow[], locale: string): Promise<LocalizationImportPreview>;
  importRows(rows: LocalizationTransferRow[], locale: string, actorUserId: string): Promise<{ importedCount: number }>;
  manage(input: {
    entityType: LocalizationEntityType;
    entityId: string;
    locale: string;
    action: LocalizationMutationAction;
    sourceHash: string;
    expectedRevision: number;
    content: LocalizationContent;
    actorUserId: string;
  }): Promise<{ revision: number; translationVersion: number; status: string }>;
  requestRetranslation(input: {
    entityType: LocalizationEntityType;
    entityId: string;
    locale: string;
    actorUserId: string;
  }): Promise<void>;
  claim(locale: string, limit: number): Promise<ClaimedTranslationBatch>;
  completeJob(input: {
    jobId: string;
    sourceHash: string;
    content: LocalizationContent;
    providerMetadata: Record<string, unknown>;
  }): Promise<{ applied: boolean; stale?: boolean }>;
  failJob(jobId: string, safeErrorCode: string): Promise<void>;
  completeRun(input: {
    runId: string;
    completed: number;
    failed: number;
    stale: number;
    applied: number;
    durationMs: number;
    safeErrorCode?: string;
  }): Promise<void>;
  requestPublication(locale: string): Promise<void>;
  claimPublication(locale: string): Promise<string | null>;
  completePublication(runId: string, succeeded: boolean, safeErrorCode?: string): Promise<void>;
}
