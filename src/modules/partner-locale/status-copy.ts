import type { PartnerLocale } from "./locale";

export type PartnerStatusDomain =
  | "estimate"
  | "order"
  | "service"
  | "support"
  | "project"
  | "onboarding"
  | "access"
  | "external_nomenclature"
  | "warranty"
  | "shipment";

const ru: Record<PartnerStatusDomain, Record<string, string>> = {
  estimate: {
    draft: "Черновик",
    ready: "Готово",
    sent: "Отправлено",
    accepted: "Принято",
    rejected: "Отклонено",
    expired: "Срок истёк",
    converted_to_order: "Переведено в заказ",
    archived: "Архив",
  },
  order: {
    processing: "Обрабатывается",
    unknown: "Статус уточняется",
    active: "Активен",
    completed: "Завершён",
    cancelled: "Отменён",
  },
  service: {
    created: "Заявка создана",
    accepted: "Принята",
    awaiting_equipment: "Ожидается оборудование",
    equipment_received: "Оборудование получено",
    diagnostics: "Диагностика",
    awaiting_information: "Ожидается информация",
    repair: "Ремонт",
    replacement_approved: "Замена одобрена",
    awaiting_replacement: "Ожидается замена",
    ready_for_pickup: "Готово к выдаче",
    closed: "Закрыто",
    rejected: "Отклонено",
    cancelled: "Отменено",
    repair_in_progress: "В ремонте",
    issued_to_customer: "Выдано",
    waiting: "Ожидание",
    unknown: "Статус уточняется",
  },
  support: {
    new: "Заявка создана",
    acknowledged: "Принята",
    in_progress: "В работе",
    waiting_for_partner: "Ожидается информация",
    solution_proposed: "Решение предложено",
    resolved: "Решена",
    closed: "Закрыта",
    rejected: "Отклонена",
    cancelled: "Отменена",
  },
  project: {
    draft: "Черновик",
    submitted: "Отправлено",
    under_review: "На рассмотрении",
    changes_requested: "Нужны изменения",
    approved: "Одобрено",
    rejected: "Отклонено",
    archived: "Архив",
  },
  onboarding: {
    draft: "Черновик",
    submitted: "Отправлено",
    under_review: "На рассмотрении",
    approved: "Одобрено",
    rejected: "Отклонено",
    cancelled: "Отменено",
    active: "Активно",
  },
  access: {
    pending: "Ожидает рассмотрения",
    active: "Активно",
    inactive: "Неактивно",
    suspended: "Приостановлено",
    revoked: "Отозвано",
    expired: "Срок истёк",
  },
  external_nomenclature: {
    new: "Новый",
    reviewing: "На рассмотрении",
    solution_proposed: "Решение предложено",
    closed: "Закрыт",
    cancelled: "Отменён",
  },
  warranty: {
    valid: "Гарантия действует",
    expired: "Гарантия истекла",
    not_found: "Не найдено",
    requires_review: "Требует проверки",
    unknown: "Статус уточняется",
  },
  shipment: {
    planned: "Запланировано",
    shipped: "Отгружено",
    delivered: "Доставлено",
    delayed: "Задерживается",
    unknown: "Статус уточняется",
  },
};

const ro: typeof ru = {
  estimate: {
    draft: "Ciornă",
    ready: "Pregătit",
    sent: "Trimis",
    accepted: "Acceptat",
    rejected: "Respins",
    expired: "Expirat",
    converted_to_order: "Transformat în comandă",
    archived: "Arhivă",
  },
  order: {
    processing: "În procesare",
    unknown: "Statutul se confirmă",
    active: "Activă",
    completed: "Finalizată",
    cancelled: "Anulată",
  },
  service: {
    created: "Cerere creată",
    accepted: "Acceptată",
    awaiting_equipment: "Se așteaptă echipamentul",
    equipment_received: "Echipament recepționat",
    diagnostics: "Diagnosticare",
    awaiting_information: "Se așteaptă informații",
    repair: "Reparație",
    replacement_approved: "Înlocuire aprobată",
    awaiting_replacement: "Se așteaptă înlocuirea",
    ready_for_pickup: "Gata de ridicare",
    closed: "Închisă",
    rejected: "Respinsă",
    cancelled: "Anulată",
    repair_in_progress: "În reparație",
    issued_to_customer: "Predat clientului",
    waiting: "În așteptare",
    unknown: "Statutul se confirmă",
  },
  support: {
    new: "Cerere creată",
    acknowledged: "Preluată",
    in_progress: "În lucru",
    waiting_for_partner: "Se așteaptă informații",
    solution_proposed: "Soluție propusă",
    resolved: "Rezolvată",
    closed: "Închisă",
    rejected: "Respinsă",
    cancelled: "Anulată",
  },
  project: {
    draft: "Ciornă",
    submitted: "Trimis",
    under_review: "În examinare",
    changes_requested: "Necesită modificări",
    approved: "Aprobat",
    rejected: "Respins",
    archived: "Arhivă",
  },
  onboarding: {
    draft: "Ciornă",
    submitted: "Trimisă",
    under_review: "În examinare",
    approved: "Aprobată",
    rejected: "Respinsă",
    cancelled: "Anulată",
    active: "Activă",
  },
  access: {
    pending: "În așteptarea examinării",
    active: "Activ",
    inactive: "Inactiv",
    suspended: "Suspendat",
    revoked: "Revocat",
    expired: "Expirat",
  },
  external_nomenclature: {
    new: "Nouă",
    reviewing: "În examinare",
    solution_proposed: "Soluție propusă",
    closed: "Închisă",
    cancelled: "Anulată",
  },
  warranty: {
    valid: "Garanție valabilă",
    expired: "Garanție expirată",
    not_found: "Nu a fost găsit",
    requires_review: "Necesită verificare",
    unknown: "Statutul se confirmă",
  },
  shipment: {
    planned: "Planificată",
    shipped: "Expediată",
    delivered: "Livrată",
    delayed: "Întârziată",
    unknown: "Statutul se confirmă",
  },
};

export function partnerStatusLabel(
  locale: PartnerLocale,
  domain: PartnerStatusDomain,
  code: string,
): string {
  return (locale === "ro" ? ro : ru)[domain][code] ?? code;
}

export function partnerStatusDictionary(
  locale: PartnerLocale,
  domain: PartnerStatusDomain,
): Readonly<Record<string, string>> {
  return (locale === "ro" ? ro : ru)[domain];
}
