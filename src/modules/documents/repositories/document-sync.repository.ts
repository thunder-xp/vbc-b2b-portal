import { createAdminClient } from "@/src/lib/supabase/admin";
import type { DocumentSyncLease, DocumentSyncPublication, DocumentSyncRepository as Contract } from "../services/document-metadata-sync.service";

export class SupabaseDocumentSyncRepository implements Contract {
  async beginOrResume(): Promise<DocumentSyncLease> {
    const { data, error } = await createAdminClient().rpc("begin_or_resume_partner_document_sync");
    if (error || !record(data)) throw repositoryError("document_sync_begin", error);
    return { syncId: text(data.syncId), sourceIndex: number(data.sourceIndex), nextSkip: number(data.nextSkip), resumed: Boolean(data.resumed), locked: Boolean(data.locked) };
  }
  async stagePage(input: Parameters<Contract["stagePage"]>[0]): Promise<void> {
    const { error } = await createAdminClient().rpc("stage_partner_document_sync_page", {
      p_sync_id: input.syncId, p_source_index: input.sourceIndex, p_source_entity: input.sourceEntity,
      p_next_source_index: input.nextSourceIndex, p_next_skip: input.nextSkip,
      p_received: input.received, p_rejected: input.rejected, p_rows: input.rows,
    });
    if (error) throw repositoryError("document_sync_stage", error);
  }
  async publish(syncId: string): Promise<DocumentSyncPublication> {
    const { data, error } = await createAdminClient().rpc("publish_partner_document_sync", { p_sync_id: syncId });
    if (error || !record(data)) throw repositoryError("document_sync_publish", error);
    return { published: number(data.published), mapped: number(data.mapped), unmapped: number(data.unmapped), linkedOrders: number(data.linkedOrders), unlinkedOrders: number(data.unlinkedOrders) };
  }
  async release(syncId: string): Promise<void> {
    const { error } = await createAdminClient().rpc("release_partner_document_sync_lease", { p_sync_id: syncId });
    if (error) throw repositoryError("document_sync_release", error);
  }
  async fail(syncId: string, safeErrorCode: string): Promise<void> {
    const { error } = await createAdminClient().rpc("fail_partner_document_sync", { p_sync_id: syncId, p_safe_error_code: safeErrorCode });
    if (error) console.error({ event: "partner_document_sync_failure_persistence_failed", syncId, errorCode: error.code });
  }
}

function repositoryError(operation: string, error: { code?: string } | null) { console.error({ event: "partner_document_sync_repository_failed", operation, errorCode: error?.code ?? null }); const failure=new Error("Document synchronization persistence failed."); failure.name="DocumentSyncRepositoryError"; return failure; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; }
