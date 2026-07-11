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

export type OneCODataCollectionPayload<T> = {
  "odata.metadata"?: string;
  value: T[];
};

export type OneCPartnerCompanyPayload = {
  Ref_Key?: string | null;
  Code?: string | null;
  Description?: string | null;
  НаименованиеПолное?: string | null;
  ИНН?: string | null;
  Покупатель?: boolean | null;
  Поставщик?: boolean | null;
  Недействителен?: boolean | null;
  DeletionMark?: boolean | null;
  IsFolder?: boolean | null;
};

export type OneCNormalizedPartnerCompanyPayload = {
  Ref_Key: string;
  Code: string;
  Description: string;
  НаименованиеПолное: string;
  ИНН: string;
  Покупатель: boolean;
  Поставщик: boolean;
  Недействителен: boolean;
  DeletionMark: boolean;
  IsFolder: boolean;
};

export type OneCPartnerCompanySyncPayload = {
  reference: OneCReferencePayload;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  status: string;
  managerReference: OneCReferencePayload | null;
  metadata: OneCMetadataPayload;
};

export type OneCPartnerContractPayload = {
  Ref_Key: string;
  Code: string;
  Description: string;
  Owner: string;
  Owner_Type: string;
  НомерДоговора?: string | null;
  ДатаДоговора?: string | null;
  ВидДоговора?: string | null;
  ВидЦен_Key?: string | null;
  ВидЦенКонтрагента_Key?: string | null;
  Организация_Key?: string | null;
  Недействителен?: boolean;
  DeletionMark?: boolean;
};

export type OneCPartnerPriceTypePayload = {
  Ref_Key: string;
  Code: string;
  Description: string;
  ВалютаЦены_Key?: string | null;
  ЦенаВключаетНДС?: boolean;
  ТипВидаЦен?: string | null;
  ЦеныАктуальны?: boolean;
  DeletionMark?: boolean;
};

export type OneCPartnerSearchPayload = OneCNormalizedPartnerCompanyPayload;

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
