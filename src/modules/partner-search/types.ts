export type PartnerSearchDocumentType =
  | "product"
  | "purchasing_list"
  | "estimate"
  | "proposal"
  | "manual_line"
  | "template";

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
