import type { EffectivePaymentState } from "@/src/modules/payments/types";
import type { CustomerServiceRequestStatus, CustomerServiceRequestType } from "./types";
import type { CabinetStatusTone } from "@/src/modules/cabinet-experience/components";

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
  return labels[status]?.[locale === "ro" ? 1 : 0] ?? (locale === "ro" ? "Comandă înregistrată" : "Заказ зарегистрирован");
}

export function orderStatusTone(status: string): CabinetStatusTone {
  if (status === "confirmed") return "success";
  if (status === "awaiting_payment") return "attention";
  return "neutral";
}

export function paymentStatus(state: EffectivePaymentState, locale: CustomerLocale) {
  const labels: Record<EffectivePaymentState, [string, string]> = {
    UNPAID: ["Не оплачено", "Neachitat"],
    PAYMENT_PENDING: ["Платёж обрабатывается", "Plata este procesată"],
    PAID: ["Оплачено", "Achitat"],
    REFUND_PENDING: ["Возврат обрабатывается", "Rambursarea este procesată"],
    REFUNDED: ["Возврат выполнен", "Rambursarea a fost efectuată"],
    FAILED: ["Платёж не выполнен", "Plata nu a fost efectuată"],
    CANCELLED: ["Платёж отменён", "Plata a fost anulată"],
  };
  return labels[state][locale === "ro" ? 1 : 0];
}

export function paymentStatusTone(state: EffectivePaymentState): CabinetStatusTone {
  if (state === "PAID") return "success";
  if (state === "PAYMENT_PENDING" || state === "REFUND_PENDING") return "pending";
  if (state === "FAILED") return "danger";
  if (state === "UNPAID") return "attention";
  return "neutral";
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
    NEW: ["Получено", "Primită"], IN_REVIEW: ["На рассмотрении", "În examinare"], NEED_INFO: ["Нужна информация", "Sunt necesare informații"],
    ACCEPTED: ["Принято в работу", "Acceptată spre lucru"], RESOLVED: ["Решено", "Rezolvată"], CLOSED: ["Закрыто", "Închisă"], CANCELLED: ["Отменено", "Anulată"],
  };
  return labels[status][locale === "ro" ? 1 : 0];
}

export function serviceStatusTone(status: CustomerServiceRequestStatus): CabinetStatusTone {
  if (status === "RESOLVED") return "success";
  if (status === "NEED_INFO") return "attention";
  if (status === "NEW" || status === "IN_REVIEW" || status === "ACCEPTED") return "information";
  return "neutral";
}

export function buyAgainAllowed(availability: string) {
  return ["in_stock", "low_stock", "available_to_order"].includes(availability);
}
