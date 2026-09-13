import type { AgentComplianceStatus, AgentReferralStatus, CommercialAgentLevel, CommercialAgentStatus } from "../agent-domain";

export const referralStatusCopy: Record<AgentReferralStatus, string> = {
  CAPTURED: "Получена", PENDING_REVIEW: "На проверке", VERIFIED: "Проверена", ACTIVE: "Закреплена",
  DUPLICATE: "Уже зарегистрирована", EXISTING_CUSTOMER: "Клиент уже работает с Novotech",
  CONFLICT: "Требуется проверка", REJECTED: "Не подтверждена", EXPIRED: "Срок закрепления завершён",
  REASSIGNED: "Передана", TERMINATED: "Завершена",
};
export const agentStatusCopy: Record<CommercialAgentStatus, string> = {
  APPLIED: "Заявка получена", COMPLIANCE_REVIEW: "Проверка данных", CONTRACT_PENDING: "Оформление договора",
  APPROVED: "Одобрен", TRAINING: "Обучение", ACTIVE: "Активен", SUSPENDED: "Доступ приостановлен",
  TERMINATED: "Сотрудничество завершено", REJECTED: "Заявка не одобрена",
};
export const levelCopy: Record<CommercialAgentLevel, string> = {
  START: "Старт", ACTIVE: "Активный", PROFESSIONAL: "Профессиональный", STRATEGIC: "Стратегический",
};
export const complianceCopy: Record<AgentComplianceStatus, string> = {
  UNREVIEWED: "Не проверено", PENDING: "На проверке", APPROVED: "Подтверждено",
  REVIEW_REQUIRED: "Требуется проверка", BLOCKED: "Ограничено", REJECTED: "Не подтверждено",
};
