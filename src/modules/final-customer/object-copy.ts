import type { CustomerObjectType } from "./types";
import type { FinalCustomerLocale } from "./locale";

export const customerObjectTypeLabels: Record<FinalCustomerLocale, Record<CustomerObjectType, string>> = {
  ru: { HOME: "Дом", APARTMENT: "Квартира", OFFICE: "Офис", SHOP: "Магазин", WAREHOUSE: "Склад", OTHER: "Другой объект" },
  ro: { HOME: "Casă", APARTMENT: "Apartament", OFFICE: "Oficiu", SHOP: "Magazin", WAREHOUSE: "Depozit", OTHER: "Alt obiect" },
};

export function customerObjectStatusLabel(status: "ACTIVE" | "ARCHIVED", locale: FinalCustomerLocale) {
  if (locale === "ro") return status === "ACTIVE" ? "Activ" : "Arhivat";
  return status === "ACTIVE" ? "Активен" : "В архиве";
}
