export const ONE_C_SERVICE_STATUSES = [
  "accepted",
  "diagnostics",
  "repair_in_progress",
  "waiting",
  "ready_for_pickup",
  "issued_to_customer",
  "closed",
  "rejected",
  "unknown",
] as const;

export type OneCServiceStatus = (typeof ONE_C_SERVICE_STATUSES)[number];

export const ONE_C_SERVICE_STATUS_LABELS: Record<OneCServiceStatus, string> = {
  accepted: "Принято в сервисный центр",
  diagnostics: "Диагностика",
  repair_in_progress: "В ремонте",
  waiting: "Ожидание",
  ready_for_pickup: "Готово к выдаче",
  issued_to_customer: "Выдано",
  closed: "Закрыто",
  rejected: "Отклонено",
  unknown: "Статус уточняется",
};

export type UnifiedServiceHistoryItem = {
  id: string;
  sourceType: "portal" | "one_c";
  number: string;
  date: string;
  status: string;
  productId: string | null;
  productSku: string | null;
  productName: string | null;
  productImageUrl: string | null;
  maskedSerial: string | null;
  reportedFault: string | null;
  warrantyState: string | null;
  warrantyEndDate: string | null;
  updatedAt: string;
  href: string;
};

export type UnifiedServiceHistoryPage = {
  items: UnifiedServiceHistoryItem[];
  total: number;
  page: number;
};

export type OneCServiceHistoryDetail = {
  id: string;
  number: string;
  date: string;
  status: OneCServiceStatus;
  sourceStatus: string | null;
  product: { id: string | null; sku: string | null; name: string | null; imageUrl: string | null; href: string | null };
  maskedSerial: string | null;
  serial?: string | null;
  protectedSerial?: string | null;
  reportedFault: string | null;
  resolution: string | null;
  warrantyState: string | null;
  warrantyStartDate: string | null;
  warrantyEndDate: string | null;
  serviceCenter: string | null;
  updatedAt: string;
  events: Array<{ id: string; type: string; status: OneCServiceStatus; occurredAt: string }>;
};

export type ServiceHistoryDiagnostics = {
  imported: number;
  mappedCompanies: number;
  unmappedCompanies: number;
  mappedProducts: number;
  unmappedProducts: number;
  serialLinked: number;
  serialUnlinked: number;
  serialResolved?: number;
  serialUnmapped?: number;
  serialConflicting?: number;
  warrantyStateLinked?: number;
  activeRepairs: number;
  readyForPickup: number;
  issued: number;
  unknownStatuses: number;
  inactive: number;
  conflicts: number;
  latestSourceDate: string | null;
  latestSync: Record<string, unknown> | null;
};

export type AdminOneCServiceHistoryItem = {
  id: string;
  number: string;
  date: string;
  status: OneCServiceStatus;
  company_name: string | null;
  sku: string | null;
  product_name: string | null;
  masked_serial: string | null;
  is_active: boolean;
  partner_visible: boolean;
  href: string;
};

export type AdminOneCServiceHistoryPage = { items: AdminOneCServiceHistoryItem[]; total: number; page: number };

export type ServiceHistorySyncClaim = {
  runId: string;
  lockToken: string;
  mode: string;
  skip: number;
  pageSize: number;
  rangeStart: string;
  rangeEnd: string;
  baseline: boolean;
};

export type ServiceSerialResolution = {
  state: "resolved" | "unmapped" | "conflict";
  value: string | null;
  sourceFingerprint: string;
};

export type ServiceSerialEnrichmentClaim = {
  runId: string;
  lockToken: string;
  rows: Array<{ id: string; serialRef: string }>;
  pageComplete: boolean;
};

export type OneCServiceSourceRow = {
  sourceDocumentRef: string;
  sourceDocumentNumber: string;
  sourceDocumentDate: string;
  sourcePosted: boolean;
  sourceDeletionMark: boolean;
  sourceDataVersion: string | null;
  sourceStatusRef: string | null;
  sourceStatus: string | null;
  normalizedStatus: OneCServiceStatus;
  counterpartyRef: string;
  productRef: string | null;
  characteristicRef: string | null;
  serialRef: string | null;
  contractRef: string | null;
  serviceCenterRef: string | null;
  reportedFault: string | null;
  sourceRepairDescription: string | null;
  sourceSaleReference: string | null;
  sourceFingerprint: string;
};
