import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

import type { ProposalCustomerResponse, ProposalDelivery, ProposalDeliveryLocale, ProposalDeliveryStatus, PublicProposalDto } from "../../types";
import type { ProposalDeliveryRepository } from "../delivery.repository";
import { ProposalDeliveryRepositoryError } from "../delivery.repository";

type DeliveryRow = {
  id: string; company_id: string; estimate_id: string; version_id: string; generated_document_id: string;
  recipient_email: string; recipient_name: string | null; email_subject: string; message_body: string | null;
  locale: ProposalDeliveryLocale; status: ProposalDeliveryStatus; idempotency_key: string; token_hash: string;
  token_expires_at: string; created_by: string; created_at: string; sent_at: string | null; failed_at: string | null;
  safe_error: string | null; revoked_at: string | null; first_opened_at: string | null; last_opened_at: string | null;
  open_count: number; responded_at: string | null; response: ProposalCustomerResponse | null; response_name: string | null; response_note: string | null;
};

const DELIVERY_COLUMNS = "id, company_id, estimate_id, version_id, generated_document_id, recipient_email, recipient_name, email_subject, message_body, locale, status, idempotency_key, token_hash, token_expires_at, created_by, created_at, sent_at, failed_at, safe_error, revoked_at, first_opened_at, last_opened_at, open_count, responded_at, response, response_name, response_note";

export class SupabaseProposalDeliveryRepository implements ProposalDeliveryRepository {
  async listByVersionIds(versionIds: string[]) {
    if (!versionIds.length) return [];
    const { data, error } = await (await createClient()).from("estimate_proposal_deliveries").select(DELIVERY_COLUMNS)
      .in("version_id", [...new Set(versionIds)]).order("created_at", { ascending: false });
    if (error) throw new ProposalDeliveryRepositoryError(error.code);
    return ((data ?? []) as DeliveryRow[]).map(mapDelivery);
  }

  async claim(input: Parameters<ProposalDeliveryRepository["claim"]>[0]) {
    return this.authenticatedRpc("claim_proposal_delivery", {
      target_version_id: input.versionId, target_document_id: input.documentId,
      target_recipient_email: input.recipientEmail, target_recipient_name: input.recipientName ?? "",
      target_subject: input.subject, target_message: input.message ?? "", target_locale: input.locale,
      target_token_hash: input.tokenHash, target_expires_at: input.expiresAt, target_idempotency_key: input.idempotencyKey,
    });
  }
  async start(deliveryId: string) { return this.authenticatedRpc("start_proposal_delivery_send", { target_delivery_id: deliveryId }); }
  async complete(deliveryId: string, providerMessageId: string | null) { return this.authenticatedRpc("complete_proposal_delivery_send", { target_delivery_id: deliveryId, target_provider_message_id: providerMessageId ?? "" }); }
  async fail(deliveryId: string, safeError: string, category: string) { return this.authenticatedRpc("fail_proposal_delivery_send", { target_delivery_id: deliveryId, target_safe_error: safeError, target_category: category }); }
  async revoke(deliveryId: string) { return this.authenticatedRpc("revoke_proposal_delivery", { target_delivery_id: deliveryId }); }

  async findPublic(tokenHash: string): Promise<PublicProposalDto | null> {
    const { data, error } = await createAdminClient().rpc("get_public_proposal_delivery", { target_token_hash: tokenHash });
    if (error) throw new ProposalDeliveryRepositoryError(error.code);
    return data ? data as PublicProposalDto : null;
  }
  async trackOpen(tokenHash: string) {
    const { error } = await createAdminClient().rpc("track_public_proposal_open", { target_token_hash: tokenHash });
    if (error) throw new ProposalDeliveryRepositoryError(error.code);
  }
  async respond(input: Parameters<ProposalDeliveryRepository["respond"]>[0]) {
    const { data, error } = await createAdminClient().rpc("submit_public_proposal_response", {
      target_token_hash: input.tokenHash, target_response: input.response,
      target_response_name: input.name ?? "", target_response_note: input.note ?? "",
    });
    if (error || !data) throw new ProposalDeliveryRepositoryError(error?.code ?? null);
    const result = data as { deliveryId: string; companyId: string; estimateId: string; versionId: string; response: ProposalCustomerResponse; respondedAt: string };
    return result;
  }
  async downloadPublicDocument(documentId: string) {
    const admin = createAdminClient();
    const { data: document, error } = await admin.from("generated_estimate_documents")
      .select("storage_bucket, storage_key, status").eq("id", documentId).maybeSingle();
    if (error || !document || document.status !== "ready" || !document.storage_bucket || !document.storage_key) throw new ProposalDeliveryRepositoryError(error?.code ?? null);
    const { data, error: storageError } = await admin.storage.from(document.storage_bucket).download(document.storage_key);
    if (storageError || !data) throw new ProposalDeliveryRepositoryError();
    return new Uint8Array(await data.arrayBuffer());
  }

  private async authenticatedRpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await (await createClient()).rpc(name, args);
    if (error || !data) throw new ProposalDeliveryRepositoryError(error?.code ?? null);
    return mapDelivery(data as DeliveryRow);
  }
}

function mapDelivery(row: DeliveryRow): ProposalDelivery {
  return {
    id: row.id, companyId: row.company_id, estimateId: row.estimate_id, versionId: row.version_id,
    generatedDocumentId: row.generated_document_id, recipientEmail: row.recipient_email, recipientName: row.recipient_name,
    emailSubject: row.email_subject, messageBody: row.message_body, locale: row.locale, status: row.status,
    idempotencyKey: row.idempotency_key, tokenHash: row.token_hash, tokenExpiresAt: row.token_expires_at,
    createdBy: row.created_by, createdAt: row.created_at, sentAt: row.sent_at, failedAt: row.failed_at,
    safeError: row.safe_error, revokedAt: row.revoked_at, firstOpenedAt: row.first_opened_at,
    lastOpenedAt: row.last_opened_at, openCount: row.open_count, respondedAt: row.responded_at,
    response: row.response, responseName: row.response_name, responseNote: row.response_note,
  };
}
