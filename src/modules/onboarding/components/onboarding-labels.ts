import type { OnboardingStatus } from "../types";

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  received: "Заявка получена",
  under_review: "На проверке",
  clarification_requested: "Требуется уточнение",
  awaiting_1c_company: "Ожидает подключения компании",
  link_confirmation_required: "Подтверждение связи",
  ready_for_approval: "Готово к подключению",
  approved: "Доступ открыт",
  rejected: "Заявка отклонена",
  cancelled: "Заявка отменена",
};

export const MATCH_LABELS: Record<string, string> = {
  exact_match: "Точное совпадение",
  multiple_candidates: "Несколько кандидатов",
  no_match: "Совпадений нет",
  inactive_match: "Контрагент неактивен",
  already_linked: "Уже связан",
  conflict_requires_admin: "Требуется администратор",
};

export const SLA_LABELS: Record<string, string> = {
  on_time: "В срок",
  paused: "SLA приостановлен",
  overdue_first_review: "Просрочена первая проверка",
  overdue_final_decision: "Просрочено решение",
};

export const INITIAL_ACCESS_LABELS: Record<string, string> = {
  owner: "Владелец",
  manager: "Менеджер",
  buyer: "Закупщик",
  accounting: "Бухгалтерия",
  retail_only: "Только розничные цены",
};
