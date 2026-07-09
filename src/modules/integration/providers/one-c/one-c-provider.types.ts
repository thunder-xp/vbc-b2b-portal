export type OneCReferencePayload = {
  ref: string;
  type: string;
};

export type OneCCatalogResponsePayload<TItem> = {
  items: TItem[];
  nextCursor?: string | null;
};

export type OneCMetadataPayload = {
  sourceUpdatedAt: string | null;
};

export type OneCCatalogCategoryPayload = {
  reference: OneCReferencePayload;
  parentReference: OneCReferencePayload | null;
  name: string;
  description: string | null;
  active: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCCatalogBrandPayload = {
  reference: OneCReferencePayload;
  name: string;
  description: string | null;
  logoUrl: string | null;
  active: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCCatalogProductPayload = {
  reference: OneCReferencePayload;
  categoryReference: OneCReferencePayload | null;
  brandReference: OneCReferencePayload | null;
  sku: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  visible: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCProductPricePayload = {
  reference: OneCReferencePayload;
  productReference: OneCReferencePayload;
  partnerCompanyReference: OneCReferencePayload | null;
  priceTypeReference: OneCReferencePayload | null;
  currency: string;
  amount: number;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCStockBalancePayload = {
  reference: OneCReferencePayload;
  productReference: OneCReferencePayload;
  warehouseReference: OneCReferencePayload | null;
  warehouseName: string;
  availableQuantity: number;
  reservedQuantity: number | null;
  expectedQuantity: number | null;
  expectedAt: string | null;
  sourceUpdatedAt: string | null;
  active: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCPartnerCompanyPayload = {
  reference: OneCReferencePayload;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  status: string;
  managerReference: OneCReferencePayload | null;
  metadata: OneCMetadataPayload;
};

export type OneCSalesOrderItemPayload = {
  productReference: OneCReferencePayload;
  sku: string;
  name: string;
  quantity: number;
  unitCode: string | null;
  currency: string | null;
  amount: number | null;
};

export type OneCSalesOrderPayload = {
  reference: OneCReferencePayload | null;
  partnerCompanyReference: OneCReferencePayload;
  portalOrderReference: string;
  status: string;
  currency: string | null;
  items: OneCSalesOrderItemPayload[];
  comment: string | null;
  metadata: OneCMetadataPayload | null;
};

export type OneCSalesOrderExportResultPayload = {
  orderReference: OneCReferencePayload;
  status: string;
  exportedAt: string;
};

export type OneCDocumentPayload = {
  reference: OneCReferencePayload;
  ownerReference: OneCReferencePayload | null;
  title: string;
  documentType: string;
  fileName: string | null;
  url: string | null;
  version: string | null;
  active: boolean;
  metadata: OneCMetadataPayload;
};

export type OneCInvoicePayload = {
  reference: OneCReferencePayload;
  partnerCompanyReference: OneCReferencePayload;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  totalAmount: number;
  paymentStatus: string;
  metadata: OneCMetadataPayload;
};

export type OneCFinanceSnapshotPayload = {
  partnerCompanyReference: OneCReferencePayload;
  balanceAmount: number | null;
  debtAmount: number | null;
  creditLimitAmount: number | null;
  currency: string | null;
  creditDays: number | null;
  sourceUpdatedAt: string | null;
  metadata: OneCMetadataPayload;
};
