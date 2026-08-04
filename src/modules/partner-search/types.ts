export type PartnerSearchDocumentType =
  | "product"
  | "purchasing_list"
  | "estimate"
  | "proposal"
  | "manual_line"
  | "template"
  | "purchase_template"
  | "commercial_campaign"
  | "document"
  | "service_case"
  | "support_ticket"
  | "knowledge";

export type PartnerSearchResult = {
  documentType: PartnerSearchDocumentType;
  documentId: string;
  title: string;
  subtitle: string | null;
  route: string;
  updatedAt: string;
};

export type PartnerSearchGroup = {
  type: PartnerSearchDocumentType;
  label: string;
  results: PartnerSearchResult[];
};
