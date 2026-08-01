export const DOCUMENT_TYPES = [
  "invoice", "fiscal_invoice", "delivery_note", "order_confirmation", "proforma", "credit_note",
  "payment_document", "reconciliation_statement", "contract", "contract_appendix",
  "warranty_certificate", "warranty_terms", "service_document", "return_or_replacement_document",
  "datasheet", "user_manual", "installation_manual", "certificate", "declaration_of_conformity",
  "test_report", "technical_drawing", "firmware_release_note", "price_list", "brochure",
  "presentation", "marketing_material",
] as const;

export type PartnerDocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentSection = "all" | "orders" | "accounting" | "reconciliation" | "warranty" | "certificates" | "instructions" | "marketing";
export type DocumentStateFilter = "current" | "all" | "expired" | "superseded";

export type DocumentRelationProduct = { id: string; sku: string; name: string; slug: string };
export type DocumentRelationOrder = { id: string; number: string };

export type PartnerDocumentListItem = {
  id: string;
  documentType: PartnerDocumentType;
  title: string;
  documentNumber: string | null;
  issueDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: "available" | "generating" | "temporarily_unavailable" | "archived";
  version: string;
  languageCode: "ru" | "ro" | "en" | "multi";
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  isCurrent: boolean;
  sourceScope: "company_specific" | "product_public";
  products: DocumentRelationProduct[];
  orders: DocumentRelationOrder[];
};

export type PartnerDocumentDetail = PartnerDocumentListItem & {
  description: string | null;
  sourceSystem: "onec" | "portal" | "catalog_projection";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerDocumentPage = { items: PartnerDocumentListItem[]; totalCount: number; page: number; pageSize: number; totalPages: number };
export type PartnerDocumentFilters = { query?: string; section?: DocumentSection; documentType?: PartnerDocumentType; language?: string; state?: DocumentStateFilter; orderId?: string; productId?: string; page?: number; pageSize?: number };

export type DocumentDownloadDescriptor = {
  documentId: string;
  retrievalMode: "private_storage" | "external_public" | "onec_protected" | "metadata_only";
  storageBucket: string | null;
  storageKey: string | null;
  externalUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

export type AdminDocumentListItem = {
  id: string; sourceSystem: string; companyName: string | null; documentType: PartnerDocumentType; title: string;
  documentNumber: string | null; status: string; version: string; languageCode: string; fileName: string | null;
  fileSize: number | null; issueDate: string | null; validUntil: string | null; isCurrent: boolean; updatedAt: string;
};
export type AdminDocumentPage = { items: AdminDocumentListItem[]; totalCount: number; page: number; totalPages: number };
export type DocumentHealth = { totalMetadata: number; availableFiles: number; missingFiles: number; expired: number; superseded: number; unlinkedOrderDocuments: number; unlinkedProductDocuments: number; downloadFailures: number; syncState: { status: string; provider_status: string; last_successful_at: string | null; safe_error_code: string | null } | null };
export type DocumentBuilderProduct = { id: string; sku: string; name: string };

export type PortalProductDocumentInput = {
  id: string; title: string; description: string | null; documentType: PartnerDocumentType; languageCode: "ru" | "ro" | "en" | "multi";
  issueDate: string | null; validFrom: string | null; validUntil: string | null; version: string; fileName: string;
  mimeType: "application/pdf"; fileSize: number; storageBucket: "partner-documents"; storageKey: string; checksumSha256: string; productIds: string[];
};

