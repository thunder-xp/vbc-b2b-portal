export const SPECIAL_OFFERS_PROMO_PROFILE = {
  name: "PROMO",
  externalCode: "UU-000021",
  externalRef: "b9f5d585-dab1-11e9-8a58-000c29cf9dd4",
  currency: "USD",
} as const;

export function missingPromoPriceMessage(sku: string, locale: "ru" | "ro" = "ru"): string {
  return locale === "ro"
    ? `Pentru poziția ${sku} lipsește prețul PROMO publicat.`
    : `Для позиции ${sku} отсутствует опубликованная цена PROMO.`;
}
