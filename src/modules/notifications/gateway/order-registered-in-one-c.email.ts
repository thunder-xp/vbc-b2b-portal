import { z } from "zod";

import { NotificationDeliveryError, type NotificationMessage } from "./types";

export const ORDER_REGISTERED_EMAIL_TEMPLATE_VERSION = 1;

const paymentEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
});

export const orderRegisteredPayloadSchema = z.object({
  companyName: z.string().min(1).max(300),
  portalOrderId: z.string().uuid(),
  oneCOrderNumber: z.string().min(1).max(100),
  orderDate: z.string().datetime({ offset: true }),
  requestedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentMethod: z.enum(["cashless", "cash"]).optional(),
  paymentCalendar: z.array(paymentEntrySchema).max(12),
  orderTotal: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
  orderPath: z.string().regex(/^\/cabinet\/orders\/[0-9a-f-]{36}$/i),
});

export type OrderRegisteredPayload = z.infer<typeof orderRegisteredPayloadSchema>;

export function renderOrderRegisteredInOneCEmail(
  payloadValue: unknown,
  recipient: string,
  applicationOrigin = notificationApplicationOrigin(),
): NotificationMessage {
  const parsed = orderRegisteredPayloadSchema.safeParse(payloadValue);
  if (!parsed.success) {
    throw new NotificationDeliveryError("invalid_payload", false);
  }
  const payload = parsed.data;
  const orderUrl = new URL(payload.orderPath, applicationOrigin).toString();
  const paymentLines = payload.paymentCalendar.map((entry) =>
    `${formatDate(entry.date)}: ${formatMoney(entry.amount, entry.currency)}`);
  const lines = [
    `Компания: ${payload.companyName}`,
    `Заказ в 1С: ${payload.oneCOrderNumber}`,
    `Дата заказа: ${formatDate(payload.orderDate)}`,
    `Запрошенная дата отгрузки: ${formatDate(payload.requestedDeliveryDate)}`,
    payload.confirmedDeliveryDate
      ? `Подтвержденная дата отгрузки: ${formatDate(payload.confirmedDeliveryDate)}`
      : null,
    paymentLines.length ? `График оплаты:\n${paymentLines.join("\n")}` : null,
    `Сумма заказа: ${formatMoney(payload.orderTotal, payload.currency)}`,
    `Открыть заказ: ${orderUrl}`,
  ].filter((line): line is string => Boolean(line));

  return {
    recipient,
    subject: `Заказ зарегистрирован в 1С — ${payload.oneCOrderNumber}`,
    text: [
      "Здравствуйте.",
      "",
      ...lines,
      "",
      "Novotech Systems Distribution",
    ].join("\n"),
    html: `<p>Здравствуйте.</p><p>Заказ успешно зарегистрирован в 1С.</p>${
      lines.map((line) => `<p>${escapeHtml(line).replaceAll("\n", "<br>")}</p>`).join("")
    }<p>Novotech Systems Distribution</p>`,
  };
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("ru-RU", {
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
