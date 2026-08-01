import type { AdminDocumentPage, DocumentBuilderProduct, DocumentDownloadDescriptor, DocumentHealth, PartnerDocumentDetail, PartnerDocumentFilters, PartnerDocumentListItem, PortalProductDocumentInput } from "../types";
import type { PartnerSearchResult } from "../../partner-search";

export class DocumentRepositoryError extends Error {
  constructor(readonly code: string | null = null) { super("Document repository failed."); this.name = "DocumentRepositoryError"; }
}

export interface DocumentRepository {
  listPartner(companyId: string, filters: PartnerDocumentFilters & { page: number; pageSize: number }): Promise<{ items: PartnerDocumentListItem[]; totalCount: number }>;
  getPartner(companyId: string, documentId: string): Promise<PartnerDocumentDetail | null>;
  authorizeDownload(companyId: string, documentId: string, correlationId: string): Promise<DocumentDownloadDescriptor>;
  recordDownload(companyId: string, documentId: string, correlationId: string, succeeded: boolean, safeErrorCode?: string): Promise<void>;
  search(companyId: string, query: string, limit: number): Promise<PartnerSearchResult[]>;
  listAdmin(query: string, page: number, pageSize: number): Promise<AdminDocumentPage>;
  getHealth(): Promise<DocumentHealth>;
  getBuilderProducts(query: string): Promise<DocumentBuilderProduct[]>;
  registerProductDocument(input: PortalProductDocumentInput): Promise<string>;
  archiveProductDocument(documentId: string): Promise<void>;
}
