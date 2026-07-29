export type StatusCategory = "success" | "warning" | "danger" | "neutral" | "information" | "running";
export type StatusIconName = "check" | "clock" | "alert" | "info" | "loader" | "minus";

export type StatusDescriptor = {
  label: string;
  category: StatusCategory;
  icon: StatusIconName;
  accessibleText: string;
  explanation?: string;
  domains: readonly string[];
};

export const canonicalStatuses = {
  draft: status("Черновик", "neutral", "minus", ["estimate", "specification", "reservation"]),
  ready: status("Готово", "success", "check", ["estimate", "document"]),
  pending: status("Ожидает рассмотрения", "warning", "clock", ["access", "invitation"]),
  submitted: status("Отправлено", "information", "clock", ["specification", "reservation"]),
  underReview: status("На рассмотрении", "running", "loader", ["specification", "reservation"]),
  sent: status("Отправлено", "information", "check", ["proposal", "invitation"]),
  accepted: status("Принято", "success", "check", ["proposal"]),
  approved: status("Одобрено", "success", "check", ["access", "specification", "reservation"]),
  partiallyApproved: status("Одобрено частично", "warning", "alert", ["reservation"]),
  changesRequested: status("Нужны изменения", "warning", "alert", ["specification"]),
  rejected: status("Отклонено", "danger", "alert", ["access", "proposal", "specification", "reservation"]),
  cancelled: status("Отменено", "neutral", "minus", ["reservation", "order"]),
  archived: status("В архиве", "neutral", "minus", ["estimate", "merchandising"]),
  active: status("Активно", "success", "check", ["membership", "invitation", "merchandising"]),
  inactive: status("Неактивно", "neutral", "minus", ["membership", "merchandising"]),
  running: status("Выполняется", "running", "loader", ["synchronization"]),
  succeeded: status("Завершено", "success", "check", ["synchronization"]),
  failed: status("Ошибка", "danger", "alert", ["synchronization", "delivery"]),
  fresh: status("Данные актуальны", "success", "check", ["finance", "catalog"]),
  stale: status("Требуется обновление", "warning", "clock", ["finance", "catalog"]),
  expired: status("Срок истёк", "neutral", "clock", ["invitation", "delivery"]),
  revoked: status("Отозвано", "danger", "alert", ["invitation", "delivery"]),
} as const satisfies Record<string, StatusDescriptor>;

export type CanonicalStatus = keyof typeof canonicalStatuses;

function status(
  label: string,
  category: StatusCategory,
  icon: StatusIconName,
  domains: readonly string[],
): StatusDescriptor {
  return { label, category, icon, accessibleText: `Статус: ${label}`, domains };
}
