import { z } from "zod";

import { publicCompanyContent } from "../../public-retail/public-company-content";
import { NotificationDeliveryError, type NotificationMessage } from "./types";

export const ORDER_CONFIRMED_EMAIL_TEMPLATE_VERSION = 2;

export type OrderConfirmedLocale = "ru" | "ro";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emailSchema = z.string().email().max(320);

const paymentEntrySchema = z.object({
  date: dateOnlySchema,
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
});

const managerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(3).max(50).nullable().optional(),
  email: z.string().max(320).nullable().optional(),
});

export const orderConfirmedEventPayloadSchema = z.object({
  locale: z.enum(["ru", "ro"]).optional(),
  customerName: z.string().min(1).max(200).nullable().optional(),
  companyName: z.string().min(1).max(300),
  portalOrderId: z.string().uuid(),
  oneCOrderNumber: z.string().min(1).max(100),
  orderDate: z.string().datetime({ offset: true }),
  requestedDeliveryDate: dateOnlySchema.nullable().optional(),
  confirmedDeliveryDate: dateOnlySchema.nullable().optional(),
  paymentMethod: z.enum(["cashless", "cash"]).optional(),
  paymentCalendar: z.array(paymentEntrySchema).max(12).default([]),
  orderTotal: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
  orderPath: z.string().regex(/^\/cabinet\/orders\/[0-9a-f-]{36}$/i),
  manager: managerSchema.nullable().optional(),
});

type OrderConfirmedEventPayload = z.infer<typeof orderConfirmedEventPayloadSchema>;

export type OrderConfirmedEmailPayload = {
  locale: OrderConfirmedLocale;
  customer: {
    name: string | null;
    companyName: string;
  };
  order: {
    id: string;
    number: string;
    orderDate: string;
    requestedShipmentDate: string | null;
    confirmedShipmentDate: string | null;
    totalAmount: number;
    currency: string;
    url: string;
  };
  paymentSchedule: Array<{
    dueDate: string;
    amount: number;
    currency: string;
  }>;
  manager: {
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  supportFallback: {
    phone: string;
    phoneHref: string;
    email: string;
  };
};

type EmailCopy = {
  subject: (orderNumber: string, shipmentDate: string | null) => string;
  status: string;
  greeting: (name: string | null) => string;
  thankYou: string;
  processing: (orderNumber: string) => string;
  confirmedShipment: string;
  plannedShipment: string;
  trustPromise: string;
  order: string;
  company: string;
  orderDate: string;
  shipment: string;
  total: string;
  payment: string;
  openOrder: string;
  linkFallback: string;
  supportQuestion: string;
  manager: string;
  supportTeam: string;
  closing: string;
  team: string;
  brandStatement: string;
};

export const orderConfirmedEmailCopy = {
  ru: {
    subject: (orderNumber, shipmentDate) => shipmentDate
      ? `Заказ ${orderNumber} подтверждён — отгрузка ${shipmentDate}`
      : `Заказ ${orderNumber} подтверждён`,
    status: "✓ Заказ подтверждён",
    greeting: (name) => name ? `Здравствуйте, ${name}.` : "Здравствуйте.",
    thankYou: "Спасибо, что выбираете Novotech Systems.",
    processing: (orderNumber) => `Ваш заказ ${orderNumber} принят и передан в обработку.`,
    confirmedShipment: "Подтверждённая дата отгрузки",
    plannedShipment: "Планируемая отгрузка",
    trustPromise: "Если дата или условия отгрузки изменятся, мы сообщим вам об этом заранее.",
    order: "Заказ",
    company: "Компания",
    orderDate: "Дата заказа",
    shipment: "Отгрузка",
    total: "Сумма",
    payment: "Оплата",
    openOrder: "Открыть заказ →",
    linkFallback: "Если кнопка не открывается, используйте ссылку:",
    supportQuestion: "Нужна помощь по этому заказу?",
    manager: "Ваш менеджер",
    supportTeam: "Команда Novotech Systems готова помочь:",
    closing: "Спасибо за доверие.",
    team: "Команда Novotech Systems",
    brandStatement: "Помогаем партнёрам быстрее комплектовать проекты и уверенно выполнять свои обязательства перед клиентами.",
  },
  ro: {
    subject: (orderNumber, shipmentDate) => shipmentDate
      ? `Comanda ${orderNumber} a fost confirmată — expediere ${shipmentDate}`
      : `Comanda ${orderNumber} a fost confirmată`,
    status: "✓ Comanda a fost confirmată",
    greeting: (name) => name ? `Bună ziua, ${name}.` : "Bună ziua.",
    thankYou: "Vă mulțumim că alegeți Novotech Systems.",
    processing: (orderNumber) => `Comanda dumneavoastră ${orderNumber} a fost acceptată și transmisă spre procesare.`,
    confirmedShipment: "Data confirmată a expedierii",
    plannedShipment: "Expediere planificată",
    trustPromise: "Dacă data sau condițiile de expediere se modifică, vă vom informa din timp.",
    order: "Comanda",
    company: "Compania",
    orderDate: "Data comenzii",
    shipment: "Expediere",
    total: "Total",
    payment: "Plată",
    openOrder: "Deschide comanda →",
    linkFallback: "Dacă butonul nu se deschide, utilizați linkul:",
    supportQuestion: "Aveți nevoie de ajutor cu această comandă?",
    manager: "Managerul dumneavoastră",
    supportTeam: "Echipa Novotech Systems este gata să vă ajute:",
    closing: "Vă mulțumim pentru încredere.",
    team: "Echipa Novotech Systems",
    brandStatement: "Ajutăm partenerii să își echipeze proiectele mai rapid și să își îndeplinească cu încredere angajamentele față de clienți.",
  },
} satisfies Record<OrderConfirmedLocale, EmailCopy>;

export function normalizeOrderConfirmedEmailPayload(
  payloadValue: unknown,
  applicationOrigin = notificationApplicationOrigin(),
  payloadVersion?: number,
): OrderConfirmedEmailPayload {
  const parsed = orderConfirmedEventPayloadSchema.safeParse(payloadValue);
  if (!parsed.success) throw new NotificationDeliveryError("invalid_payload", false);
  const payload = parsed.data;
  const locale = payload.locale === "ro" ? "ro" : "ru";
  assertValidDate(payload.orderDate);
  assertValidDateOnly(payload.requestedDeliveryDate);
  assertValidDateOnly(payload.confirmedDeliveryDate);
  payload.paymentCalendar.forEach((entry) => assertValidDateOnly(entry.date));

  const isCurrentPayload = payloadVersion === undefined
    ? payload.locale !== undefined
    : payloadVersion >= 2;
  const manager = normalizeManager(payload.manager);

  return {
    locale,
    customer: {
      name: cleanOptional(payload.customerName),
      companyName: payload.companyName.trim(),
    },
    order: {
      id: payload.portalOrderId,
      number: payload.oneCOrderNumber.trim(),
      orderDate: payload.orderDate,
      requestedShipmentDate: payload.requestedDeliveryDate ?? null,
      confirmedShipmentDate: isCurrentPayload
        ? payload.confirmedDeliveryDate ?? null
        : null,
      totalAmount: payload.orderTotal,
      currency: payload.currency.trim().toUpperCase(),
      url: new URL(payload.orderPath, applicationOrigin).toString(),
    },
    paymentSchedule: payload.paymentCalendar.map((entry) => ({
      dueDate: entry.date,
      amount: entry.amount,
      currency: entry.currency.trim().toUpperCase(),
    })),
    manager,
    supportFallback: {
      phone: publicCompanyContent.customerPhone.display,
      phoneHref: publicCompanyContent.customerPhone.href,
      email: publicCompanyContent.email,
    },
  };
}

export function orderConfirmedEmailSubject(payload: OrderConfirmedEmailPayload): string {
  const copy = orderConfirmedEmailCopy[payload.locale];
  const shipmentDate = payload.order.confirmedShipmentDate
    ? formatHeadlineDate(payload.order.confirmedShipmentDate, payload.locale, false)
    : null;
  return copy.subject(payload.order.number, shipmentDate);
}

export function renderOrderConfirmedEmail(
  payloadValue: unknown,
  recipient: string,
  applicationOrigin = notificationApplicationOrigin(),
  payloadVersion?: number,
): NotificationMessage {
  const payload = normalizeOrderConfirmedEmailPayload(
    payloadValue,
    applicationOrigin,
    payloadVersion,
  );
  const copy = orderConfirmedEmailCopy[payload.locale];
  return {
    recipient,
    subject: orderConfirmedEmailSubject(payload),
    text: renderText(payload, copy),
    html: renderHtml(payload, copy),
  };
}

function renderText(payload: OrderConfirmedEmailPayload, copy: EmailCopy): string {
  const shipmentDate = payload.order.confirmedShipmentDate
    ?? payload.order.requestedShipmentDate;
  const shipmentLabel = payload.order.confirmedShipmentDate
    ? copy.confirmedShipment
    : payload.order.requestedShipmentDate
      ? copy.plannedShipment
      : null;
  const paymentLines = payload.paymentSchedule.map((entry) =>
    `${formatCompactDate(entry.dueDate, payload.locale)} — ${formatMoney(entry.amount, entry.currency, payload.locale)}`);
  const contact = contactText(payload, copy);

  return [
    "NOVOTECH SYSTEMS",
    "Distribution • Solutions • Partnership",
    "",
    copy.status,
    "",
    copy.greeting(payload.customer.name),
    "",
    copy.thankYou,
    copy.processing(payload.order.number),
    shipmentDate && shipmentLabel ? "" : null,
    shipmentDate && shipmentLabel ? `${shipmentLabel}:` : null,
    shipmentDate ? formatHeadlineDate(shipmentDate, payload.locale, true) : null,
    "",
    `${copy.order}: ${payload.order.number}`,
    `${copy.company}: ${payload.customer.companyName}`,
    `${copy.orderDate}: ${formatCompactDate(payload.order.orderDate, payload.locale)}`,
    shipmentDate ? `${copy.shipment}: ${formatCompactDate(shipmentDate, payload.locale)}` : null,
    `${copy.total}: ${formatMoney(payload.order.totalAmount, payload.order.currency, payload.locale)}`,
    paymentLines.length ? `${copy.payment}:` : null,
    ...paymentLines,
    "",
    `${copy.openOrder.replace(" →", "")}:`,
    payload.order.url,
    "",
    copy.trustPromise,
    "",
    copy.supportQuestion,
    ...contact,
    "",
    copy.closing,
    copy.team,
    "",
    copy.brandStatement,
  ].filter((line): line is string => line !== null).join("\n");
}

function renderHtml(payload: OrderConfirmedEmailPayload, copy: EmailCopy): string {
  const shipmentDate = payload.order.confirmedShipmentDate
    ?? payload.order.requestedShipmentDate;
  const shipmentLabel = payload.order.confirmedShipmentDate
    ? copy.confirmedShipment
    : payload.order.requestedShipmentDate
      ? copy.plannedShipment
      : null;
  const summaryRows = [
    summaryRow(copy.order, payload.order.number),
    summaryRow(copy.company, payload.customer.companyName),
    summaryRow(copy.orderDate, formatCompactDate(payload.order.orderDate, payload.locale)),
    shipmentDate ? summaryRow(copy.shipment, formatCompactDate(shipmentDate, payload.locale)) : "",
    summaryRow(copy.total, formatMoney(payload.order.totalAmount, payload.order.currency, payload.locale), true),
    payload.paymentSchedule.length ? paymentRow(payload, copy) : "",
  ].join("");
  const contact = contactHtml(payload, copy);
  const safeOrderUrl = escapeHtml(payload.order.url);

  return `<!doctype html>
<html lang="${payload.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(orderConfirmedEmailSubject(payload))}</title>
  <style>
    @media only screen and (max-width: 520px) {
      .email-shell { width: 100% !important; }
      .email-body { padding: 24px 18px !important; }
      .email-header { padding: 20px 18px !important; }
      .cta { display: block !important; text-align: center !important; }
      .summary-label, .summary-value { display: block !important; width: 100% !important; text-align: left !important; }
      .summary-value { padding-top: 3px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f5f4;color:#181c1a;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.processing(payload.order.number))}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;background:#f3f5f4;">
    <tr><td align="center" style="padding:24px 10px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:100%;max-width:640px;border-collapse:collapse;background:#ffffff;border:1px solid #dfe4e1;">
        <tr><td class="email-header" style="padding:22px 32px;background:#111513;color:#ffffff;">
          <div style="font-size:18px;line-height:24px;font-weight:700;letter-spacing:0;color:#ffffff;">NOVOTECH SYSTEMS</div>
          <div style="margin-top:4px;font-size:12px;line-height:18px;color:#cbd3cf;">Distribution • Solutions • Partnership</div>
        </td></tr>
        <tr><td class="email-body" style="padding:34px 32px 30px;">
          <div style="font-size:25px;line-height:32px;font-weight:700;color:#12633b;">${escapeHtml(copy.status)}</div>
          <p style="margin:24px 0 0;font-size:16px;line-height:24px;color:#181c1a;">${escapeHtml(copy.greeting(payload.customer.name))}</p>
          <p style="margin:16px 0 0;font-size:16px;line-height:24px;color:#303633;">${escapeHtml(copy.thankYou)}<br>${escapeHtml(copy.processing(payload.order.number))}</p>
          ${shipmentDate && shipmentLabel ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;border-collapse:collapse;background:#f1f7f3;border-left:4px solid #157347;"><tr><td style="padding:16px 18px;"><div style="font-size:12px;line-height:18px;font-weight:700;text-transform:uppercase;color:#486057;">${escapeHtml(shipmentLabel)}</div><div style="margin-top:4px;font-size:21px;line-height:28px;font-weight:700;color:#173d2c;">${escapeHtml(formatHeadlineDate(shipmentDate, payload.locale, true))}</div></td></tr></table>` : ""}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;border-collapse:collapse;border:1px solid #dfe4e1;">
            ${summaryRows}
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:collapse;"><tr><td bgcolor="#111513" style="background:#111513;"><a href="${safeOrderUrl}" class="cta" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">${escapeHtml(copy.openOrder)}</a></td></tr></table>
          <p style="margin:12px 0 0;font-size:11px;line-height:17px;color:#69716d;">${escapeHtml(copy.linkFallback)}<br><a href="${safeOrderUrl}" style="color:#3f6152;text-decoration:underline;word-break:break-all;">${safeOrderUrl}</a></p>
          <p style="margin:24px 0 0;padding:16px 0;border-top:1px solid #dfe4e1;border-bottom:1px solid #dfe4e1;font-size:14px;line-height:22px;font-weight:600;color:#2d3732;">${escapeHtml(copy.trustPromise)}</p>
          <div style="margin-top:24px;">${contact}</div>
          <p style="margin:28px 0 0;font-size:15px;line-height:23px;color:#303633;">${escapeHtml(copy.closing)}<br><strong>${escapeHtml(copy.team)}</strong></p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f7f8f7;border-top:1px solid #dfe4e1;font-size:12px;line-height:19px;color:#66706b;">${escapeHtml(copy.brandStatement)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function summaryRow(label: string, value: string, strong = false): string {
  return `<tr><td class="summary-label" width="38%" style="width:38%;padding:11px 14px;border-bottom:1px solid #e6eae8;font-size:12px;line-height:18px;color:#67706c;vertical-align:top;">${escapeHtml(label)}</td><td class="summary-value" style="padding:11px 14px;border-bottom:1px solid #e6eae8;font-size:14px;line-height:20px;${strong ? "font-weight:700;" : ""}color:#181c1a;vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function paymentRow(payload: OrderConfirmedEmailPayload, copy: EmailCopy): string {
  const entries = payload.paymentSchedule.map((entry) =>
    `<div style="font-size:14px;line-height:21px;color:#181c1a;">${escapeHtml(formatCompactDate(entry.dueDate, payload.locale))} — ${escapeHtml(formatMoney(entry.amount, entry.currency, payload.locale))}</div>`).join("");
  return `<tr><td class="summary-label" width="38%" style="width:38%;padding:11px 14px;font-size:12px;line-height:18px;color:#67706c;vertical-align:top;">${escapeHtml(copy.payment)}</td><td class="summary-value" style="padding:11px 14px;font-size:14px;line-height:20px;color:#181c1a;vertical-align:top;">${entries}</td></tr>`;
}

function contactText(payload: OrderConfirmedEmailPayload, copy: EmailCopy): string[] {
  if (payload.manager) {
    const lines = [copy.manager, payload.manager.name];
    if (payload.manager.phone) lines.push(payload.manager.phone);
    if (payload.manager.email) lines.push(payload.manager.email);
    if (!payload.manager.phone && !payload.manager.email) {
      lines.push(payload.supportFallback.email, payload.supportFallback.phone);
    }
    return lines;
  }
  return [copy.supportTeam, payload.supportFallback.email, payload.supportFallback.phone];
}

function contactHtml(payload: OrderConfirmedEmailPayload, copy: EmailCopy): string {
  if (payload.manager) {
    const channels = [
      payload.manager.phone ? contactLink(phoneHref(payload.manager.phone), payload.manager.phone) : "",
      payload.manager.email ? contactLink(`mailto:${encodeURIComponent(payload.manager.email)}`, payload.manager.email) : "",
    ].filter(Boolean).join("<br>");
    const fallbackChannels = channels || [
      contactLink(`mailto:${encodeURIComponent(payload.supportFallback.email)}`, payload.supportFallback.email),
      contactLink(payload.supportFallback.phoneHref, payload.supportFallback.phone),
    ].join("<br>");
    return `<div style="font-size:15px;line-height:23px;font-weight:700;color:#181c1a;">${escapeHtml(copy.supportQuestion)}</div><div style="margin-top:10px;font-size:12px;line-height:18px;color:#67706c;">${escapeHtml(copy.manager)}</div><div style="margin-top:2px;font-size:15px;line-height:23px;font-weight:700;color:#181c1a;">${escapeHtml(payload.manager.name)}</div><div style="margin-top:4px;font-size:14px;line-height:22px;color:#303633;">${fallbackChannels}</div>`;
  }
  return `<div style="font-size:15px;line-height:23px;font-weight:700;color:#181c1a;">${escapeHtml(copy.supportQuestion)}</div><div style="margin-top:8px;font-size:14px;line-height:22px;color:#303633;">${escapeHtml(copy.supportTeam)}<br>${contactLink(`mailto:${encodeURIComponent(payload.supportFallback.email)}`, payload.supportFallback.email)}<br>${contactLink(payload.supportFallback.phoneHref, payload.supportFallback.phone)}</div>`;
}

function contactLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#12633b;text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function normalizeManager(manager: OrderConfirmedEventPayload["manager"]): OrderConfirmedEmailPayload["manager"] {
  if (!manager) return null;
  const name = manager.name.trim();
  if (!name) return null;
  const email = cleanOptional(manager.email)?.toLowerCase() ?? null;
  return {
    name,
    phone: normalizePhone(manager.phone),
    email: email && emailSchema.safeParse(email).success ? email : null,
  };
}

function cleanOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function phoneHref(phone: string): string {
  const normalized = phone.trim().replace(/[^+\d]/g, "");
  return `tel:${normalized}`;
}

function normalizePhone(value: string | null | undefined): string | null {
  const phone = cleanOptional(value);
  if (!phone) return null;
  return phone.replace(/\D/g, "").length >= 7 ? phone : null;
}

function notificationApplicationOrigin(): string {
  const candidate = process.env.PUBLIC_APP_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://www.nsd.md";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    return `${url.origin}/`;
  } catch {
    throw new NotificationDeliveryError("configuration", false);
  }
}

function assertValidDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new NotificationDeliveryError("invalid_payload", false);
  }
}

function assertValidDateOnly(value: string | null | undefined): void {
  if (!value) return;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new NotificationDeliveryError("invalid_payload", false);
  }
}

function formatHeadlineDate(value: string, locale: OrderConfirmedLocale, includeYear: boolean): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "Europe/Chisinau",
  }).format(dateForFormatting(value));
}

function formatCompactDate(value: string, locale: OrderConfirmedLocale): string {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(dateForFormatting(value));
}

function dateForFormatting(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
}

function formatMoney(amount: number, currency: string, locale: OrderConfirmedLocale): string {
  return `${new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}
