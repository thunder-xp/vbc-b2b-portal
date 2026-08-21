import type { DocumentSection, PartnerDocumentType } from "./types";
import type { PartnerLocale } from "../partner-locale/locale";

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

export function documentStateLabel(document: { status: string; isCurrent: boolean; validUntil: string | null; fileName?: string | null }): string {
  if (!document.isCurrent && document.status === "temporarily_unavailable") return "Аннулирован";
  if (!document.isCurrent) return "Заменён новой версией";
  if (document.status === "generating") return "Документ формируется";
  if (document.status === "temporarily_unavailable") return "Файл пока недоступен";
  if (document.status === "available" && document.fileName === null) return "Проведён";
  if (document.validUntil && Date.parse(document.validUntil) < Date.now()) return "Срок действия истёк";
  return "Актуальная версия";
}

const RO_DOCUMENT_TYPE_LABELS: Record<PartnerDocumentType, string> = {
  invoice: "Factură", fiscal_invoice: "Factură fiscală", delivery_note: "Aviz de însoțire", order_confirmation: "Confirmarea comenzii",
  proforma: "Factură proformă", credit_note: "Notă de credit", payment_document: "Document de plată", reconciliation_statement: "Act de verificare",
  contract: "Contract", contract_appendix: "Anexă la contract", warranty_certificate: "Certificat de garanție",
  warranty_terms: "Condiții de garanție", service_document: "Document de service", return_or_replacement_document: "Document de retur sau înlocuire",
  datasheet: "Fișă tehnică", user_manual: "Manual de utilizare", installation_manual: "Instrucțiuni de instalare",
  certificate: "Certificat", declaration_of_conformity: "Declarație de conformitate", test_report: "Raport de testare",
  technical_drawing: "Desen tehnic", firmware_release_note: "Note despre versiunea firmware", price_list: "Listă de prețuri",
  brochure: "Broșură", presentation: "Prezentare", marketing_material: "Material informativ",
};

const RO_SECTIONS: Record<DocumentSection, string> = {
  all: "Toate documentele", orders: "Comenzi și livrări", accounting: "Facturi și contabilitate", reconciliation: "Acte de verificare", warranty: "Garanție și service", certificates: "Certificate", instructions: "Instrucțiuni și fișe tehnice", marketing: "Liste de prețuri și materiale",
};

export function documentTypeLabel(locale: PartnerLocale, type: PartnerDocumentType): string {
  return locale === "ro" ? RO_DOCUMENT_TYPE_LABELS[type] : DOCUMENT_TYPE_LABELS[type];
}

export function documentSectionLabel(locale: PartnerLocale, section: DocumentSection): string {
  return locale === "ro" ? RO_SECTIONS[section] : DOCUMENT_SECTIONS.find((item) => item.value === section)?.label ?? section;
}

export function isCurrentDocumentState(document: { status: string; isCurrent: boolean; validUntil: string | null }): boolean {
  return document.isCurrent
    && document.status === "available"
    && (!document.validUntil || Date.parse(document.validUntil) >= Date.now());
}

export function localizedDocumentStateLabel(locale: PartnerLocale, document: { status: string; isCurrent: boolean; validUntil: string | null; fileName?: string | null }): string {
  if (locale === "ru") return documentStateLabel(document);
  if (!document.isCurrent && document.status === "temporarily_unavailable") return "Anulat";
  if (!document.isCurrent) return "Înlocuit cu o versiune nouă";
  if (document.status === "generating") return "Documentul se generează";
  if (document.status === "temporarily_unavailable") return "Fișier momentan indisponibil";
  if (document.status === "available" && document.fileName === null) return "Înregistrat";
  if (document.validUntil && Date.parse(document.validUntil) < Date.now()) return "Termen expirat";
  return "Versiune curentă";
}
