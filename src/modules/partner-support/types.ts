export const SUPPORT_PRIORITIES = ["high", "medium", "low"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export const SUPPORT_STATUSES = ["new", "acknowledged", "in_progress", "waiting_for_partner", "solution_proposed", "resolved", "closed", "rejected", "cancelled"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_CATEGORIES = ["account_and_access", "catalog", "price_or_stock", "cart", "order_submission", "order_history", "documents", "finance", "notifications", "service_center", "performance", "data_mismatch", "other"] as const;
export const SUPPORT_CATEGORY_LABELS: Record<(typeof SUPPORT_CATEGORIES)[number], string> = { account_and_access: "Аккаунт и доступ", catalog: "Каталог", price_or_stock: "Цена или наличие", cart: "Корзина", order_submission: "Отправка заказа", order_history: "История заказов", documents: "Документы", finance: "Финансы", notifications: "Уведомления", service_center: "Сервисный центр", performance: "Производительность", data_mismatch: "Несоответствие данных", other: "Другое" };

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = { high: "Высокий", medium: "Средний", low: "Низкий" };
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "Заявка создана", acknowledged: "Принята", in_progress: "В работе", waiting_for_partner: "Ожидается информация",
  solution_proposed: "Решение предложено", resolved: "Решена", closed: "Закрыта", rejected: "Отклонена", cancelled: "Отменена",
};

export type SupportTicketListItem = {
  id: string; ticketNumber: string; description: string; requestedPriority: SupportPriority; effectivePriority: SupportPriority;
  status: SupportStatus; companyName?: string; applicantName?: string; applicantEmail?: string; applicantPhone?: string | null;
  partnerStatus?: string; category?: string | null; assignedInternalUserId?: string | null; assignedInternalUserName?: string | null; createdAt: string; updatedAt: string;
  nextAction?: string; overdue?: boolean;
};
export type SupportTicketPage = { items: SupportTicketListItem[]; total: number; page: number };
export type SupportTicketDetail = {
  id: string; ticketNumber: string; companyId: string; status: SupportStatus; requestedPriority: SupportPriority; effectivePriority: SupportPriority;
  category: string | null; description: string; applicant: { name: string; email: string; phone: string | null; role: string; company: string; fiscalCode: string | null; partnerStatus: string };
  assignedInternalUserId: string | null; firstResponseDueAt: string; resolutionDueAt: string; resolutionSummary: string | null; sourceRoute?: string | null; locale: "ru" | "ro";
  createdAt: string; updatedAt: string; version: number;
  messages: Array<{ id: string; body: string; visibility: "partner" | "internal"; authorUserId: string; createdAt: string }>;
  events: Array<{ id: string; type: string; message: string | null; occurredAt: string }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; fileSize: number; createdAt: string }>;
};
export type SupportDashboardItem = { id: string; ticketNumber: string; status: SupportStatus; updatedAt: string; nextAction: string; href: string };
export type SupportDiagnostics = { totalTickets: number; new: number; unassigned: number; highPriority: number; waitingForPartner: number; overdueFirstResponse: number; overdueResolution: number; resolved: number; closed: number; notificationFailures: number; attachmentFailures: number; oldestUnresolved: string | null; latestSlaWorker: Record<string, unknown> | null };
export type SupportAssignee = { id: string; name: string; email: string };
