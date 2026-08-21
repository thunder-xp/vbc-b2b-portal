import { formatPartnerRelativeDate } from "./format";
import type { PartnerLocale } from "./locale";

export const platformDashboardAttentionKinds = [
  "notification_cart_product_price_changed",
  "notification_cart_product_availability_changed",
  "notification_warehouse_arrival_completed",
  "test_return_overdue",
  "test_return_today",
  "portal_order_failure",
  "shipment_overdue",
  "shipment_today",
  "date_change_rejected",
  "date_change_pending",
] as const;

export type PlatformDashboardAttentionKind = typeof platformDashboardAttentionKinds[number];

type AttentionPresentationInput = {
  kind: string;
  title: string;
  consequence: string;
  ctaLabel: string;
  orderNumber: string | null;
  plannedDate: string | null;
  consequenceSource?: "platform" | "source";
};

export function presentDashboardAttention<T extends AttentionPresentationInput>(
  item: T,
  locale: PartnerLocale,
  now = Date.now(),
): T {
  if (!isPlatformDashboardAttentionKind(item.kind)) return item;

  const orderNumber = item.orderNumber?.trim() ?? "";
  const openOrder = locale === "ro" ? "Deschide comanda" : "Открыть заказ";

  switch (item.kind) {
    case "notification_cart_product_price_changed":
      return withPresentation(item, locale === "ro"
        ? ["Prețul unui produs din coș s-a modificat", "Verificați prețurile actuale înainte de trimiterea comenzii.", "Deschide coșul"]
        : ["Цена товара в корзине изменилась", "Проверьте актуальные цены перед отправкой заказа.", "Открыть корзину"]);
    case "notification_cart_product_availability_changed":
      return withPresentation(item, locale === "ro"
        ? ["Disponibilitatea unui produs din coș s-a modificat", "Verificați disponibilitatea actuală înainte de trimiterea comenzii.", "Deschide coșul"]
        : ["Наличие товара в корзине изменилось", "Проверьте актуальное наличие перед отправкой заказа.", "Открыть корзину"]);
    case "notification_warehouse_arrival_completed":
      return withPresentation(item, locale === "ro"
        ? ["Ultima aprovizionare a depozitului", "Livrarea a fost finalizată. Produsele au ajuns în depozit și sunt disponibile pentru expediere.", "Vezi ultima aprovizionare"]
        : ["Новое пополнение склада", "Поставка завершена. Товары поступили на склад и доступны для отгрузки.", "Посмотреть поступление"]);
    case "test_return_overdue": {
      const relative = item.plannedDate
        ? formatPartnerRelativeDate(item.plannedDate, locale, now)
        : null;
      const consequence = locale === "ro"
        ? `Perioada de testare s-a încheiat${relative ? ` ${relative}` : ""}. Vă rugăm să returnați echipamentul în stare comercială la depozitul Novotech.`
        : `Тестовый период завершён${relative ? ` ${relative}` : ""}. Просим вернуть оборудование в товарном виде на склад Novotech.`;
      return withPresentation(item, locale === "ro"
        ? ["Perioada de testare s-a încheiat", consequence, openOrder]
        : ["Тестовый период завершён", consequence, openOrder]);
    }
    case "test_return_today":
      return withPresentation(item, locale === "ro"
        ? ["Perioada de testare se încheie astăzi", "Vă rugăm să pregătiți echipamentul pentru returnare.", openOrder]
        : ["Тестовый период завершается сегодня", "Просим подготовить оборудование к возврату.", openOrder]);
    case "portal_order_failure":
      return withPresentation(item, locale === "ro"
        ? [orderNumber ? `Comanda ${orderNumber} necesită verificare` : "Trimiterea comenzii necesită verificare", "Coșul a fost păstrat. Deschideți comanda și verificați starea.", openOrder]
        : [orderNumber ? `Заказ ${orderNumber} требует проверки` : "Отправка заказа требует проверки", "Корзина сохранена. Откройте заказ и проверьте статус.", openOrder]);
    case "shipment_overdue":
      return withPresentation(item, locale === "ro"
        ? [`Livrarea comenzii${orderNumber ? ` ${orderNumber}` : ""} este întârziată`, "Verificați data curentă și solicitați reprogramarea dacă este necesar.", openOrder]
        : [`Отгрузка заказа${orderNumber ? ` ${orderNumber}` : ""} просрочена`, "Проверьте текущую дату и при необходимости запросите перенос.", openOrder]);
    case "shipment_today":
      return withPresentation(item, locale === "ro"
        ? [`Livrarea comenzii${orderNumber ? ` ${orderNumber}` : ""} este planificată astăzi`, "Deschideți comanda pentru a verifica pozițiile și starea curentă.", openOrder]
        : [`Отгрузка заказа${orderNumber ? ` ${orderNumber}` : ""} запланирована сегодня`, "Откройте заказ, чтобы проверить позиции и текущий статус.", openOrder]);
    case "date_change_rejected":
      return withPresentation(item, locale === "ro"
        ? [`Reprogramarea comenzii${orderNumber ? ` ${orderNumber}` : ""} a fost respinsă`, item.consequenceSource === "source" ? item.consequence : "Deschideți comanda pentru a vedea decizia.", openOrder]
        : [`Перенос даты по заказу${orderNumber ? ` ${orderNumber}` : ""} отклонён`, item.consequenceSource === "source" ? item.consequence : "Откройте заказ для просмотра решения.", openOrder]);
    case "date_change_pending":
      return withPresentation(item, locale === "ro"
        ? [`Solicitarea de reprogramare a comenzii${orderNumber ? ` ${orderNumber}` : ""} este în curs de examinare`, "Novotech verifică posibilitatea modificării datei de livrare.", openOrder]
        : [`Запрос переноса по заказу${orderNumber ? ` ${orderNumber}` : ""} рассматривается`, "Novotech проверяет возможность изменения даты отгрузки.", openOrder]);
  }
}

export function isPlatformDashboardAttentionKind(kind: string): kind is PlatformDashboardAttentionKind {
  return (platformDashboardAttentionKinds as readonly string[]).includes(kind);
}

function withPresentation<T extends AttentionPresentationInput>(
  item: T,
  [title, consequence, ctaLabel]: readonly [string, string, string],
): T {
  return { ...item, title, consequence, ctaLabel };
}
