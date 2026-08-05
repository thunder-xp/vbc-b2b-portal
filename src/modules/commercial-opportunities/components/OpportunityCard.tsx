"use client";

import { ArrowRight, CalendarClock, EyeOff, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import { CatalogQuantityCartAction } from "../../catalog/components/CatalogQuantityCartAction";
import { ProductSpecificationAction } from "../../catalog/components/ProductSpecificationAction";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { dismissCommercialOpportunityAction } from "../actions/commercial-opportunity.actions";
import type { CommercialOpportunity } from "../types";

export function OpportunityCard({ canAddToOrder = true, canAddToSpecification = true, canManagePurchasingLists = true, opportunity }: { canAddToOrder?: boolean; canAddToSpecification?: boolean; canManagePurchasingLists?: boolean; opportunity: CommercialOpportunity }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const product = opportunity.product;
  const template = opportunity.template;
  const title = product?.name ?? template?.name ?? "Повторная закупка";
  const href = product
    ? `/cabinet/catalog/${product.slug}`
    : template
      ? `/cabinet/purchase-templates/${template.id}`
      : opportunity.type === "previous_order_repeatable"
        ? `/cabinet/orders/${opportunity.sourceId}`
        : "/cabinet/opportunities";

  function dismiss() {
    startTransition(async () => {
      const result = await dismissCommercialOpportunityAction(opportunity.id);
      setMessage(result.message);
      if (result.success) {
        recordBehaviorInteraction({
          eventName: "opportunity_dismissed",
          metadataSafe: { opportunityType: opportunity.type },
          route: "/cabinet/opportunities",
          sourceSurface: "opportunity_card",
        });
        router.refresh();
      }
    });
  }

  return (
    <article className="grid min-w-0 gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
      {product ? <Link aria-label={`Открыть товар ${product.name}`} className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" href={href} prefetch={false}><CatalogCardImage alt={`${product.name}, ${product.sku}`} sizes="112px" src={product.reference?.thumbnail ?? product.imageUrl} variant="md" /></Link> : <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-zinc-100"><ShoppingCart aria-hidden="true" className="size-8 text-zinc-400" /></div>}
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-700">{opportunityLabel(opportunity.type)}</p>
            {product ? <p className="mt-1 text-xs text-zinc-500">Артикул {product.sku}</p> : null}
            <h2 className="mt-1 line-clamp-2 font-semibold text-zinc-950" title={title}>{product ? <Link className="rounded hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500" href={href} prefetch={false}>{title}</Link> : title}</h2>
          </div>
          <button aria-label={`Не показывать: ${title}`} className="flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500" disabled={pending} onClick={dismiss} title="Не показывать" type="button"><EyeOff aria-hidden="true" className="size-4" /></button>
        </div>

        <p className="mt-3 text-sm font-medium text-zinc-800">{primaryReason(opportunity)}</p>
        {opportunity.secondaryReasons.length ? <div className="mt-2 flex flex-wrap gap-1.5">{opportunity.secondaryReasons.map((reason) => <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600" key={reason}>{secondaryReason(reason)}</span>)}</div> : null}

        {product ? <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>{priceLabel(product)}</div>
          <div>{availabilityLabel(product)}</div>
        </div> : null}

        <div className="mt-4 flex flex-wrap items-start gap-2">
          {product && canAddToOrder && (product.partnerPrice || product.retailPrice) ? <div className="min-w-[15rem] flex-1"><CatalogQuantityCartAction initialQuantity={suggestedQuantity(opportunity)} productId={product.id} sourceSurface="opportunity_card" successEventName="opportunity_added_to_cart" /></div> : null}
          {product && canManagePurchasingLists ? <FavoriteProductButton initialSaved={false} productId={product.id} /> : null}
          {product && canAddToSpecification ? <ProductSpecificationAction productId={product.id} /> : null}
          {!product ? <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 focus-visible:ring-2 focus-visible:ring-emerald-500" href={href} onClick={() => recordBehaviorInteraction({ eventName: template ? "opportunity_template_opened" : "opportunity_repeat_started", metadataSafe: { opportunityType: opportunity.type }, route: "/cabinet/opportunities", sourceSurface: "opportunity_card" })} prefetch={false}>{template ? "Проверить шаблон" : "Повторить закупку"}<ArrowRight aria-hidden="true" className="size-4" /></Link> : null}
        </div>
        {message ? <p aria-live="polite" className="mt-2 text-sm font-medium text-emerald-700">{message}</p> : null}
      </div>
    </article>
  );
}

function opportunityLabel(type: CommercialOpportunity["type"]): string {
  return ({ repeat_purchase_available: "Можно повторить закупку", watched_product_back_in_stock: "Снова в наличии", relevant_product_arrival_confirmed: "Ожидается поступление", relevant_product_price_decreased: "Цена стала ниже", purchase_template_ready: "Шаблон готов к заказу", previous_order_repeatable: "Можно повторить закупку", relevant_merchandising_offer: "Предложение Novotech", relevant_product_low_stock: "Осталось немного", source_product_low_stock_with_available_analog: "Доступен аналог" } satisfies Record<CommercialOpportunity["type"], string>)[type];
}

function primaryReason(opportunity: CommercialOpportunity): string {
  const value = opportunity.reasonMetadata;
  if (opportunity.reasonCode === "back_in_stock") return "Товар из вашего списка снова доступен.";
  if (opportunity.reasonCode === "confirmed_arrival") return `Поступление ${numberValue(value.expectedQuantity)} шт. подтверждено на ${dateValue(value.expectedDate)}.`;
  if (opportunity.reasonCode === "price_decreased") return `Текущая цена на ${numberValue(value.decreasePercent)}% ниже предыдущей подтверждённой цены.`;
  if (opportunity.reasonCode === "repeat_purchase") return `Вы покупали этот товар ${numberValue(value.purchaseCount)} раз. Последняя покупка — ${dateValue(value.lastPurchasedAt)}.`;
  if (opportunity.reasonCode === "low_stock") return "Товар, который вы регулярно покупаете, заканчивается на складе.";
  if (opportunity.reasonCode === "available_analog") return "Товар заканчивается. Доступен аналог.";
  if (opportunity.reasonCode === "template_fully_ready") return `Все ${numberValue(value.itemCount)} позиций шаблона доступны.`;
  if (opportunity.reasonCode === "template_mostly_ready") return `${numberValue(value.availableCount)} из ${numberValue(value.itemCount)} позиций доступны, ещё ${numberValue(value.expectedCount)} ожидаются.`;
  if (opportunity.reasonCode === "previous_order_repeatable") return `Снова доступны ${numberValue(value.eligibleCount)} из ${numberValue(value.itemCount)} позиций заказа.`;
  if (opportunity.reasonCode === "relevant_merchandising") return `Актуальное предложение по товару, связанному с вашей закупочной активностью.`;
  return "Коммерческие условия по релевантному товару изменились.";
}

function secondaryReason(reason: string): string {
  return ({ repeat_purchase: "Покупали ранее", back_in_stock: "Снова доступен", confirmed_arrival: "Подтверждено поступление", low_stock: "Низкий остаток", relevant_merchandising: "Предложение Novotech" } as Record<string, string>)[reason] ?? reason;
}
function priceLabel(product: NonNullable<CommercialOpportunity["product"]>) { const price = product.partnerPrice ?? product.retailPrice; return price ? <p><span className="block text-xs text-zinc-500">{product.partnerPrice ? "Ваша цена" : "Розничная цена"}</span><strong>{formatMoney(price.amount, price.currency)}</strong></p> : <p className="text-zinc-600">Цена уточняется</p>; }
function availabilityLabel(product: NonNullable<CommercialOpportunity["product"]>) { if ((product.availableQuantity ?? 0) > 0) return <p><span className="block text-xs text-zinc-500">Наличие</span><strong>В наличии: {product.availableQuantity} шт.</strong></p>; if (product.expectedArrivalDate) return <p><span className="block text-xs text-zinc-500">Поступление</span><strong className="inline-flex items-center gap-1"><CalendarClock className="size-4" />{dateValue(product.expectedArrivalDate)}</strong></p>; return <p className="text-zinc-600">Наличие уточняется</p>; }
function suggestedQuantity(opportunity: CommercialOpportunity): number { const raw = Number(opportunity.reasonMetadata.typicalQuantity ?? 1); return Number.isInteger(raw) && raw >= 1 && raw <= 9999 ? raw : 1; }
function numberValue(value: unknown): string { const parsed = Number(value); return Number.isFinite(parsed) ? new Intl.NumberFormat("ru-RU").format(parsed) : "—"; }
function dateValue(value: unknown): string { if (typeof value !== "string") return "дата уточняется"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "дата уточняется" : date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }); }
function formatMoney(amount: number, currency: string): string { try { return new Intl.NumberFormat("ru-RU", { style: "currency", currency, currencyDisplay: "code" }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; } }
