import type { MaibPaymentEvidence } from "../../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMaibCallback(rawBody: Uint8Array): MaibPaymentEvidence | null {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(rawBody).toString("utf8")); }
  catch { return null; }
  const row = objectValue(value);
  const checkoutId = uuidValue(row.checkoutId);
  const paymentId = uuidValue(row.paymentId);
  const orderReference = uuidValue(row.orderId);
  const checkoutAmount = moneyValue(row.amount);
  const checkoutCurrency = boundedString(row.currency, 3);
  const paymentAmount = moneyValue(row.paymentAmount);
  const paymentCurrency = boundedString(row.paymentCurrency, 3);
  const paymentStatus = boundedString(row.paymentStatus, 100);
  const providerEventAt = isoDateValue(row.paymentExecutedAt) ?? isoDateValue(row.completedAt);
  const rrn = nullableBoundedString(row.retrievalReferenceNumber, 100);
  if (!checkoutId || !paymentId || !orderReference || !checkoutAmount || !checkoutCurrency
    || !paymentAmount || !paymentCurrency || !paymentStatus || !providerEventAt) return null;
  return { checkoutId, paymentId, orderReference, checkoutAmount, checkoutCurrency, paymentAmount, paymentCurrency, paymentStatus, providerEventAt, rrn };
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function uuidValue(value: unknown) { return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null; }
function boundedString(value: unknown, maxLength: number) { return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null; }
function nullableBoundedString(value: unknown, maxLength: number) { return value === null || value === undefined ? null : boundedString(value, maxLength); }
function isoDateValue(value: unknown) { return typeof value === "string" && value.length <= 80 && !Number.isNaN(Date.parse(value)) ? value : null; }
function moneyValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 999999999999.99) return null;
  const minor = value * 100;
  if (Math.abs(Math.round(minor) - minor) > 1e-7) return null;
  return value.toFixed(2);
}
