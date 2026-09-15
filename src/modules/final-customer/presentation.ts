import type { CustomerServiceRequestStatus, CustomerServiceRequestType } from "./types";

export type CustomerLocale = "ru" | "ro";

export function customerMoney(value: number, currency: string, locale: CustomerLocale) {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", { style: "currency", currency }).format(value);
}

export function customerDate(value: string, locale: CustomerLocale) {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-MD" : "ru-MD", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function orderStatus(status: string, locale: CustomerLocale) {
  const labels: Record<string, [string, string]> = {
    draft: ["Черновик", "Ciornă"], awaiting_payment: ["Ожидает оплаты", "Așteaptă plata"], confirmed: ["Оплачен и подтверждён", "Plătită și confirmată"],
  };
  return labels[status]?.[locale === "ro" ? 1 : 0] ?? status;
}

export function serviceTypeLabel(type: CustomerServiceRequestType, locale: CustomerLocale) {
  const labels: Record<CustomerServiceRequestType, [string, string]> = {
    INSTALLATION_REQUEST: ["Заявка на монтаж", "Cerere de instalare"], DIAGNOSTICS: ["Диагностика", "Diagnosticare"],
    WARRANTY_QUESTION: ["Вопрос по гарантии", "Întrebare despre garanție"], PRODUCT_QUESTION: ["Вопрос по товару", "Întrebare despre produs"],
    ORDER_QUESTION: ["Вопрос по заказу", "Întrebare despre comandă"], OTHER: ["Другое", "Altele"],
  };
  return labels[type][locale === "ro" ? 1 : 0];
}

export function serviceStatusLabel(status: CustomerServiceRequestStatus, locale: CustomerLocale) {
  const labels: Record<CustomerServiceRequestStatus, [string, string]> = {
    NEW: ["Новая", "Nouă"], IN_REVIEW: ["На рассмотрении", "În examinare"], NEED_INFO: ["Нужна информация", "Sunt necesare informații"],
    ACCEPTED: ["Принята", "Acceptată"], RESOLVED: ["Решена", "Rezolvată"], CLOSED: ["Закрыта", "Închisă"], CANCELLED: ["Отменена", "Anulată"],
  };
  return labels[status][locale === "ro" ? 1 : 0];
}

export function buyAgainAllowed(availability: string) {
  return ["in_stock", "low_stock", "available_to_order"].includes(availability);
}
