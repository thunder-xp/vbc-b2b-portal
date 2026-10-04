export const SPECIAL_OFFERS_COPY = {
  ru: { title: "Специальные предложения", create: "Новое предложение", edit: "Редактировать предложение", preview: "Предпросмотр" },
  ro: { title: "Oferte speciale", create: "Ofertă nouă", edit: "Editează oferta", preview: "Previzualizare" },
} as const;

export function readableCampaignText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text && !/\?{3,}|\uFFFD/.test(text) ? text : fallback;
}
