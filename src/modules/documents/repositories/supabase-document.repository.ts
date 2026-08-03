import { createClient } from "@/src/lib/supabase/server";
import type { PartnerSearchResult } from "../../partner-search";
import type { DocumentRepository } from "./document.repository";
import { DocumentRepositoryError } from "./document.repository";
import type { AdminDocumentListItem, DocumentDownloadDescriptor, DocumentHealth, PartnerDocumentDetail, PartnerDocumentListItem, PortalProductDocumentInput } from "../types";

type Row = Record<string, unknown>;

export class SupabaseDocumentRepository implements DocumentRepository {
  async listPartnerRecent(companyId: string, limit: number) {
    const { data, error } = await (await createClient()).rpc("list_partner_dashboard_documents", {
      p_company_id: companyId,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) throw new DocumentRepositoryError(error?.code ?? null);
    return data.flatMap(mapListItem);
  }

  async listPartner(companyId: string, input: Parameters<DocumentRepository["listPartner"]>[1]) {
    const { data, error } = await (await createClient()).rpc("list_partner_documents", {
      p_company_id: companyId, p_query: input.query ?? "", p_section: input.section ?? "all", p_document_type: input.documentType ?? null,
      p_language: input.language ?? null, p_state: input.state ?? "current", p_order_history_id: input.orderId ?? null,
      p_product_id: input.productId ?? null, p_page: input.page, p_page_size: input.pageSize,
    });
    if (error || !Array.isArray(data)) throw new DocumentRepositoryError(error?.code ?? null);
    return { items: data.flatMap(mapListItem), totalCount: number(record(data[0]) ? data[0].total_count : 0) };
  }
  async getPartner(companyId: string, documentId: string): Promise<PartnerDocumentDetail | null> {
    const { data, error } = await (await createClient()).rpc("get_partner_document", { p_company_id: companyId, p_document_id: documentId });
    if (error) throw new DocumentRepositoryError(error.code);
    return mapDetail(data);
  }
  async authorizeDownload(companyId: string, documentId: string, correlationId: string): Promise<DocumentDownloadDescriptor> {
    const { data, error } = await (await createClient()).rpc("authorize_partner_document_download", { p_company_id: companyId, p_document_id: documentId, p_correlation_id: correlationId });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !record(row)) throw new DocumentRepositoryError(error?.code ?? null);
    return { documentId: text(row.document_id), retrievalMode: text(row.retrieval_mode) as DocumentDownloadDescriptor["retrievalMode"], storageBucket: nullableText(row.storage_bucket), storageKey: nullableText(row.storage_key), externalUrl: nullableText(row.external_url), fileName: nullableText(row.file_name), mimeType: nullableText(row.mime_type), fileSize: nullableNumber(row.file_size) };
  }
  async recordDownload(companyId: string, documentId: string, correlationId: string, succeeded: boolean, safeErrorCode?: string) {
    const { error } = await (await createClient()).rpc("record_partner_document_download", { p_company_id: companyId, p_document_id: documentId, p_correlation_id: correlationId, p_succeeded: succeeded, p_safe_error_code: safeErrorCode ?? null });
    if (error) throw new DocumentRepositoryError(error.code);
  }
  async search(companyId: string, query: string, limit: number): Promise<PartnerSearchResult[]> {
    const { data, error } = await (await createClient()).rpc("search_partner_documents", { p_company_id: companyId, p_query: query, p_limit: limit });
    if (error || !Array.isArray(data)) throw new DocumentRepositoryError(error?.code ?? null);
    return data.filter(record).map((row) => ({ documentType: "document", documentId: text(row.document_id), title: text(row.title), subtitle: nullableText(row.subtitle), route: text(row.route), updatedAt: text(row.updated_at) }));
  }
  async listAdmin(query: string, page: number, pageSize: number) {
    const { data, error } = await (await createClient()).rpc("list_admin_documents", { p_query: query, p_page: page, p_page_size: pageSize });
    if (error || !Array.isArray(data)) throw new DocumentRepositoryError(error?.code ?? null);
    const items = data.filter(record).map(mapAdmin);
    const totalCount = number(record(data[0]) ? data[0].total_count : 0);
    return { items, totalCount, page, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
  }
  async getHealth(): Promise<DocumentHealth> {
    const { data, error } = await (await createClient()).rpc("get_admin_document_health");
    if (error || !record(data)) throw new DocumentRepositoryError(error?.code ?? null);
    return { totalMetadata: number(data.totalMetadata), availableFiles: number(data.availableFiles), missingFiles: number(data.missingFiles), expired: number(data.expired), superseded: number(data.superseded), unlinkedOrderDocuments: number(data.unlinkedOrderDocuments), unlinkedProductDocuments: number(data.unlinkedProductDocuments), downloadFailures: number(data.downloadFailures), syncState: record(data.syncState) ? data.syncState as DocumentHealth["syncState"] : null };
  }
  async getBuilderProducts(query: string) {
    const { data, error } = await (await createClient()).rpc("get_document_builder_products", { p_query: query });
    if (error || !Array.isArray(data)) throw new DocumentRepositoryError(error?.code ?? null);
    return data.filter(record).map((row) => ({ id: text(row.id), sku: text(row.sku), name: text(row.name) }));
  }
  async registerProductDocument(input: PortalProductDocumentInput) {
    const { data, error } = await (await createClient()).rpc("register_portal_product_document", {
      p_document_id: input.id, p_title: input.title, p_description: input.description, p_document_type: input.documentType,
      p_language_code: input.languageCode, p_issue_date: input.issueDate, p_valid_from: input.validFrom, p_valid_until: input.validUntil,
      p_version: input.version, p_file_name: input.fileName, p_mime_type: input.mimeType, p_file_size: input.fileSize,
      p_storage_bucket: input.storageBucket, p_storage_key: input.storageKey, p_checksum_sha256: input.checksumSha256, p_product_ids: input.productIds,
    });
    if (error || typeof data !== "string") throw new DocumentRepositoryError(error?.code ?? null);
    return data;
  }
  async archiveProductDocument(documentId: string) { const { error } = await (await createClient()).rpc("archive_portal_product_document", { p_document_id: documentId }); if (error) throw new DocumentRepositoryError(error.code); }
}

function mapListItem(value: unknown): PartnerDocumentListItem[] {
  if (!record(value) || typeof value.id !== "string") return [];
  return [{ id: value.id, documentType: text(value.document_type) as PartnerDocumentListItem["documentType"], title: text(value.title), documentNumber: nullableText(value.document_number), issueDate: nullableText(value.issue_date), validFrom: nullableText(value.valid_from), validUntil: nullableText(value.valid_until), status: text(value.status) as PartnerDocumentListItem["status"], version: text(value.version), languageCode: text(value.language_code) as PartnerDocumentListItem["languageCode"], fileName: nullableText(value.file_name), mimeType: nullableText(value.mime_type), fileSize: nullableNumber(value.file_size), isCurrent: Boolean(value.is_current), sourceScope: text(value.source_scope) as PartnerDocumentListItem["sourceScope"], products: records(value.related_products).map((row) => ({ id: text(row.id), sku: text(row.sku), name: text(row.name), slug: text(row.slug) })), orders: records(value.related_orders).map((row) => ({ id: text(row.id), number: text(row.number) })) }];
}
function mapDetail(value: unknown): PartnerDocumentDetail | null {
  if (!record(value) || typeof value.id !== "string") return null;
  const base = mapListItem({ ...value, related_products: value.products, related_orders: value.orders, source_scope: value.company_id ? "company_specific" : "product_public" })[0];
  return base ? { ...base, description: nullableText(value.description), sourceSystem: text(value.source_system) as PartnerDocumentDetail["sourceSystem"], publishedAt: nullableText(value.published_at), createdAt: text(value.created_at), updatedAt: text(value.updated_at) } : null;
}
function mapAdmin(row: Row): AdminDocumentListItem { return { id: text(row.id), sourceSystem: text(row.source_system), companyName: nullableText(row.company_name), documentType: text(row.document_type) as AdminDocumentListItem["documentType"], title: text(row.title), documentNumber: nullableText(row.document_number), status: text(row.status), version: text(row.version), languageCode: text(row.language_code), fileName: nullableText(row.file_name), fileSize: nullableNumber(row.file_size), issueDate: nullableText(row.issue_date), validUntil: nullableText(row.valid_until), isCurrent: Boolean(row.is_current), updatedAt: text(row.updated_at) }; }
function record(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value); }
function records(value: unknown): Row[] { return Array.isArray(value) ? value.filter(record) : []; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : number(value); }
