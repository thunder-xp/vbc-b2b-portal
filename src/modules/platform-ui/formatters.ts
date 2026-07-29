const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const quantityFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const amountFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatBusinessDate(value: string | Date | null | undefined): string {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatBusinessDateTime(value: string | Date | null | undefined): string {
  const date = toValidDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

export function formatBusinessAmount(value: number | string | null | undefined, currencyCode: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amountFormatter.format(amount)} ${currencyCode}` : "—";
}

export function formatBusinessQuantity(value: number | string | null | undefined, unit = "шт."): string {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? `${quantityFormatter.format(quantity)} ${unit}` : "—";
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
