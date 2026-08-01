import type { DocumentSection, PartnerDocumentType } from "./types";

export const DOCUMENT_TYPE_LABELS: Record<PartnerDocumentType, string> = {
  invoice: "Счёт", fiscal_invoice: "Налоговая накладная", delivery_note: "Накладная", order_confirmation: "Подтверждение заказа",
  proforma: "Счёт-проформа", credit_note: "Кредит-нота", payment_document: "Платёжный документ", reconciliation_statement: "Акт сверки",
  contract: "Договор", contract_appendix: "Приложение к договору", warranty_certificate: "Гарантийный сертификат",
  warranty_terms: "Условия гарантии", service_document: "Сервисный документ", return_or_replacement_document: "Документ возврата или замены",
  datasheet: "Техническая спецификация", user_manual: "Руководство пользователя", installation_manual: "Инструкция по монтажу",
  certificate: "Сертификат", declaration_of_conformity: "Декларация соответствия", test_report: "Протокол испытаний",
  technical_drawing: "Технический чертёж", firmware_release_note: "Описание версии прошивки", price_list: "Прайс-лист",
  brochure: "Брошюра", presentation: "Презентация", marketing_material: "Информационный материал",
};

export const DOCUMENT_SECTIONS: ReadonlyArray<{ value: DocumentSection; label: string }> = [
  { value: "all", label: "Все документы" }, { value: "orders", label: "Заказы и отгрузки" },
  { value: "accounting", label: "Счета и бухгалтерия" }, { value: "reconciliation", label: "Акты сверки" },
  { value: "warranty", label: "Гарантия и сервис" }, { value: "certificates", label: "Сертификаты" },
  { value: "instructions", label: "Инструкции и Datasheet" }, { value: "marketing", label: "Прайс-листы и материалы" },
];

export function documentStateLabel(document: { status: string; isCurrent: boolean; validUntil: string | null }): string {
  if (document.status === "generating") return "Документ формируется";
  if (document.status === "temporarily_unavailable") return "Файл временно недоступен";
  if (!document.isCurrent) return "Доступна более новая версия";
  if (document.validUntil && Date.parse(document.validUntil) < Date.now()) return "Срок действия истёк";
  return "Актуальная версия";
}

