import { NotificationDeliveryError, type ClaimedNotificationDelivery } from "./types";

type Snapshot = {
  orderNumber: string;
  merchantName: string;
  website: string;
  amount: number;
  currency: string;
  confirmedAt: string;
  locale: "ru" | "ro";
  items: Array<{ name: string; sku: string; quantity: number }>;
};

export function renderRetailPaymentConfirmedEmail(delivery: ClaimedNotificationDelivery) {
  const value = parseSnapshot(delivery.renderedSnapshot);
  const ro = value.locale === "ro";
  const amount = new Intl.NumberFormat(ro ? "ro-MD" : "ru-MD", { style: "currency", currency: value.currency, minimumFractionDigits: 2 }).format(value.amount);
  const paidAt = new Intl.DateTimeFormat(ro ? "ro-MD" : "ru-MD", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Chisinau" }).format(new Date(value.confirmedAt));
  const subject = ro ? `Plata comenzii ${value.orderNumber} a fost confirmată` : `Оплата заказа ${value.orderNumber} подтверждена`;
  const heading = ro ? "Plata a fost confirmată" : "Оплата подтверждена";
  const lines = value.items.map((item) => `${item.sku} — ${item.name} × ${item.quantity}`);
  const text = [heading, `${ro ? "Comanda" : "Заказ"}: ${value.orderNumber}`, `${ro ? "Suma" : "Сумма"}: ${amount}`, `${ro ? "Data plății" : "Дата оплаты"}: ${paidAt}`, "", ro ? "Produse:" : "Товары:", ...lines, "", `${value.merchantName} · ${value.website}`].join("\n");
  const items = value.items.map((item) => `<li><strong>${escapeHtml(item.sku)}</strong> — ${escapeHtml(item.name)} × ${item.quantity}</li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#18181b"><h1 style="font-size:24px">${heading}</h1><p><strong>${ro ? "Comanda" : "Заказ"}:</strong> ${escapeHtml(value.orderNumber)}</p><p><strong>${ro ? "Suma" : "Сумма"}:</strong> ${escapeHtml(amount)}</p><p><strong>${ro ? "Data plății" : "Дата оплаты"}:</strong> ${escapeHtml(paidAt)}</p><h2 style="font-size:18px">${ro ? "Produse" : "Товары"}</h2><ul>${items}</ul><p>${escapeHtml(value.merchantName)} · ${escapeHtml(value.website)}</p></div>`;
  return { recipient: delivery.recipient, subject, text, html };
}

function parseSnapshot(input: unknown): Snapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  const value = input as Record<string, unknown>;
  const amount = Number(value.amount);
  if (typeof value.orderNumber !== "string" || !/^R-[0-9]{4}-[0-9]{6}$/.test(value.orderNumber)
    || typeof value.merchantName !== "string" || typeof value.website !== "string"
    || !Number.isFinite(amount) || amount <= 0 || typeof value.currency !== "string"
    || typeof value.confirmedAt !== "string" || Number.isNaN(Date.parse(value.confirmedAt))
    || (value.locale !== "ru" && value.locale !== "ro") || !Array.isArray(value.items) || value.items.length < 1) throw invalid();
  const items = value.items.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid();
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name || typeof item.sku !== "string" || !item.sku
      || !Number.isInteger(item.quantity) || Number(item.quantity) < 1) throw invalid();
    return { name: item.name, sku: item.sku, quantity: Number(item.quantity) };
  });
  return { orderNumber: value.orderNumber, merchantName: value.merchantName, website: value.website, amount,
    currency: value.currency, confirmedAt: value.confirmedAt, locale: value.locale, items };
}

function invalid() { return new NotificationDeliveryError("invalid_payload", false); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
