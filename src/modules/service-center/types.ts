export const SERVICE_CASE_TYPES = [
  "warranty_diagnosis", "repair_request", "replacement_request", "return_request",
  "technical_consultation", "missing_item_or_accessory", "other_product_issue",
] as const;
export type ServiceCaseType = (typeof SERVICE_CASE_TYPES)[number];

export const SERVICE_STATUSES = [
  "created", "accepted", "awaiting_equipment", "equipment_received", "diagnostics",
  "awaiting_information", "repair", "replacement_approved", "awaiting_replacement",
  "ready_for_pickup", "closed", "rejected", "cancelled",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceCaseType, string> = {
  warranty_diagnosis: "Гарантийная диагностика", repair_request: "Ремонт",
  replacement_request: "Запрос на замену", return_request: "Запрос на возврат",
  technical_consultation: "Техническая консультация", missing_item_or_accessory: "Недостающая комплектующая",
  other_product_issue: "Другая проблема с товаром",
};
export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  created: "Заявка создана", accepted: "Принята", awaiting_equipment: "Ожидается оборудование",
  equipment_received: "Оборудование получено", diagnostics: "Диагностика",
  awaiting_information: "Ожидается информация", repair: "Ремонт",
  replacement_approved: "Одобрена замена", awaiting_replacement: "Ожидается поставка замены",
  ready_for_pickup: "Готово к выдаче", closed: "Закрыто", rejected: "Отклонено", cancelled: "Отменено",
};

export type ServiceCaseListItem = {
  id: string; caseNumber: string; caseType: ServiceCaseType; status: ServiceStatus; priority: string;
  companyName?: string; productSku: string | null; productName: string | null; productImageUrl?: string | null;
  serialNumber: string | null; warrantyState: string; replacementState: string;
  assignedInternalUserId?: string | null; createdAt: string; updatedAt: string; overdue: boolean;
};
export type ServiceCasePage = { items: ServiceCaseListItem[]; total: number; page: number };
export type ServiceCaseDetail = {
  id: string; companyId: string; caseNumber: string; caseType: ServiceCaseType; status: ServiceStatus;
  priority: string; productId: string | null; orderId: string | null; orderLineId: string | null;
  serialNumber: string | null; faultCategory: string; description: string; symptoms: string | null;
  issueStartedOn: string | null; powersOn: boolean | null; factoryResetAttempted: boolean | null;
  preferredContact: string | null; purchaseVerificationState: string; warrantyState: string;
  warrantyEndDate: string | null; replacementState: string; assignedInternalUserId: string | null;
  createdAt: string; updatedAt: string; version: number;
  product: { id: string; sku: string; name: string; imageUrl: string | null; href: string | null } | null;
  order: { id: string; number: string; date: string } | null;
  events: Array<{ id: string; type: string; message: string | null; occurredAt: string }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; fileSize: number; createdAt: string }>;
  documents: Array<{ id: string; title: string; documentType: string; fileName: string | null }>;
};

export type ServiceCaseCreateInput = {
  caseType: ServiceCaseType; productId: string | null; orderId: string | null; orderLineId: string | null;
  warrantyVerificationId: string | null;
  enteredSerial: string; faultCategory: string; description: string; symptoms: string;
  issueStartedOn: string | null; powersOn: boolean | null; factoryResetAttempted: boolean | null;
  preferredContact: string; evidenceConsent: boolean;
};

export type ServiceSelectionData = {
  orders: Array<{ id: string; number: string; date: string; lines: Array<{ id: string; productId: string | null; sku: string | null; name: string | null }> }>;
  products: Array<{ id: string; sku: string; name: string }>;
};

export type ServiceDashboardItem = {
  id: string; caseNumber: string; status: ServiceStatus | "repair_in_progress" | "issued_to_customer" | "unknown"; productName: string | null;
  productImageUrl: string | null; updatedAt: string; nextAction: string; href: string;
};
export type ServiceAdminAttentionItem = {
  id: string; caseId: string; caseNumber: string; eventCode: string; title: string;
  message: string; actionUrl: string; createdAt: string;
};
export type ServiceDiagnostics = {
  totalCases: number; active: number; unassigned: number; waitingForPartner: number;
  waitingForEquipment: number; diagnosis: number; repair: number; replacement: number;
  readyForPickup: number; overdue: number; closed: number; notificationFailures: number;
  missingRequiredDocuments: number; attachmentFailures: number; oldestUnresolvedCase: string | null;
  latestSlaWorker: Record<string, unknown> | null;
};
export const SERVICE_DOCUMENT_TYPES = [
  "service_acceptance_act", "diagnostic_report", "repair_act", "replacement_act",
  "return_act", "warranty_decision",
] as const;
export type ServiceDocumentType = (typeof SERVICE_DOCUMENT_TYPES)[number];
