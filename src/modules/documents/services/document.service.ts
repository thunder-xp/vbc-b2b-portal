import { createHash } from "node:crypto";

import { InvalidStateError, NotFoundError } from "../../access-control/services";
import type { PartnerWorkspaceContextService } from "../../partner-cabinet/services";
import type { DocumentRepository } from "../repositories";
import type { PartnerDocumentFilters, PortalProductDocumentInput } from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PDF_LIMIT = 15 * 1024 * 1024;

export class DocumentService {
  constructor(private readonly repository: DocumentRepository, private readonly workspaceContext: PartnerWorkspaceContextService) {}

  async listPartner(userId: string, filters: PartnerDocumentFilters = {}) {
    const companyId = await this.companyId(userId);
    const page = integer(filters.page, 1, 100000, 1);
    const pageSize = integer(filters.pageSize, 1, 50, 20);
    const result = await this.repository.listPartner(companyId, { ...filters, query: filters.query?.trim().slice(0, 100), page, pageSize });
    return { ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.totalCount / pageSize)) };
  }
  async getPartner(userId: string, documentId: string) { return this.repository.getPartner(await this.companyId(userId), uuid(documentId)); }
  async listForOrder(userId: string, orderId: string) { return this.listPartner(userId, { orderId: uuid(orderId), pageSize: 20 }); }
  async listForProduct(userId: string, productId: string) { return this.listPartner(userId, { productId: uuid(productId), section: "all", pageSize: 30 }); }
  async authorizeDownload(userId: string, documentId: string, correlationId: string) { return this.repository.authorizeDownload(await this.companyId(userId), uuid(documentId), uuid(correlationId)); }
  async recordDownload(userId: string, documentId: string, correlationId: string, succeeded: boolean, safeErrorCode?: string) { await this.repository.recordDownload(await this.companyId(userId), uuid(documentId), uuid(correlationId), succeeded, safeErrorCode); }
  async search(userId: string, query: string, limit = 10) { return this.repository.search(await this.companyId(userId), query.trim().slice(0, 100), integer(limit, 1, 20, 10)); }
  listAdmin(query = "", page = 1) { return this.repository.listAdmin(query.trim().slice(0, 100), integer(page, 1, 100000, 1), 25); }
  getHealth() { return this.repository.getHealth(); }
  getBuilderProducts(query = "") { return this.repository.getBuilderProducts(query.trim().slice(0, 100)); }
  registerProductDocument(input: PortalProductDocumentInput) { validateInput(input); return this.repository.registerProductDocument(input); }
  archiveProductDocument(documentId: string) { return this.repository.archiveProductDocument(uuid(documentId)); }

  private async companyId(userId: string) {
    const context = await this.workspaceContext.getWorkspaceContext(userId);
    if (context.accessState !== "active" || !context.companyId || !context.capabilities.navigation.some((item) => item.key === "documents" && item.availability === "available")) throw new NotFoundError("Document Center is not available.");
    return context.companyId;
  }
}

export function validateProductDocumentFile(bytes: Uint8Array, mimeType: string): { checksum: string; size: number } {
  if (mimeType !== "application/pdf" || bytes.length < 5 || bytes.length > PDF_LIMIT || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") throw new InvalidStateError("DOCUMENT_FILE_INVALID");
  return { checksum: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

function validateInput(input: PortalProductDocumentInput) {
  if (!UUID.test(input.id) || input.title.trim().length < 2 || input.title.trim().length > 240 || input.version.trim().length < 1 || input.version.trim().length > 50 || input.productIds.length < 1 || input.productIds.length > 100 || input.productIds.some((id) => !UUID.test(id)) || !/^[0-9a-f]{64}$/.test(input.checksumSha256) || input.mimeType !== "application/pdf") throw new InvalidStateError("Document metadata is invalid.");
  if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) throw new InvalidStateError("Document validity period is invalid.");
}
function integer(value: number | undefined, min: number, max: number, fallback: number) { const parsed = Math.trunc(value ?? fallback); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function uuid(value: string) { const normalized = value.trim(); if (!UUID.test(normalized)) throw new NotFoundError("Document was not found."); return normalized; }

