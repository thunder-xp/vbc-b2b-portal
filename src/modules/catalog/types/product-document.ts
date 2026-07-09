export type CatalogProductDocumentType =
  | "datasheet"
  | "manual"
  | "certificate"
  | "warranty"
  | "marketing"
  | "other";

export interface CatalogProductDocument {
  id: string;
  productId: string;
  title: string;
  documentType: CatalogProductDocumentType;
  url: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
