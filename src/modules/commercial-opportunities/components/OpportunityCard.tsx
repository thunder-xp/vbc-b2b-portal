"use client";

import { ArrowRight, CalendarClock, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  formatPartnerDate,
  formatPartnerMoney,
  formatPartnerNumber,
  type PartnerLocale,
} from "@/src/modules/partner-locale";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import { CatalogCardImage } from "../../catalog/components/CatalogCardImage";
import { CatalogQuantityCartAction } from "../../catalog/components/CatalogQuantityCartAction";
import type { LiveCommerceSelectionProduct } from "../../catalog/services/live-commerce-selection";
import { ProductSpecificationAction } from "../../catalog/components/ProductSpecificationAction";
import { ProductComparisonAction } from "../../catalog/components/ProductComparisonAction";
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { dismissCommercialOpportunityAction } from "../actions/commercial-opportunity.actions";
import type { CommercialOpportunity } from "../types";
import { compactActionClassName } from "../../platform-ui/action-styles";
import { IconActionTooltip } from "../../platform-ui/IconActionTooltip";

export function OpportunityCard({
  canAddToOrder = true,
  canAddToSpecification = true,
  canManagePurchasingLists = true,
  companyId = null,
  opportunity,
  locale = "ru",
  userId = null,
}: {
  canAddToOrder?: boolean;
  canAddToSpecification?: boolean;
  canManagePurchasingLists?: boolean;
  companyId?: string | null;
  opportunity: CommercialOpportunity;
  locale?: PartnerLocale;
  userId?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const product = opportunity.product;
  const template = opportunity.template;
  const repeatPurchase = opportunity.type === "repeat_purchase_available";
  const relatedProduct = opportunity.type === "related_product";
  const partnerPriceOnly = repeatPurchase || relatedProduct;
  const alreadyInCart = partnerPriceOnly && product?.alreadyInCart;
  const title =
    product?.name ??
    template?.name ??
    (locale === "ro" ? "Achiziție repetată" : "Повторная закупка");
  const href = product
    ? `/cabinet/catalog/${product.slug}`
    : template
      ? `/cabinet/purchase-templates/${encodeURIComponent(template.id)}`
      : opportunity.type === "previous_order_repeatable"
        ? `/cabinet/orders/${opportunity.sourceId}`
        : "/cabinet/opportunities";

  function dismiss() {
    startTransition(async () => {
      const result = await dismissCommercialOpportunityAction(opportunity.id);
      setMessage(
        result.success && locale === "ro"
          ? "Oportunitatea nu va mai fi afișată."
          : result.message,
      );
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

  if (product) {
    return <ProductOpportunityCard
      alreadyInCart={alreadyInCart}
      canAddToOrder={canAddToOrder}
      canAddToSpecification={canAddToSpecification}
      canManagePurchasingLists={canManagePurchasingLists}
      companyId={companyId}
      dismiss={dismiss}
      href={href}
      locale={locale}
      message={message}
      opportunity={opportunity}
      partnerPriceOnly={partnerPriceOnly}
      pending={pending}
      title={title}
      userId={userId}
    />;
  }

  return (
    <article className="grid min-w-0 self-start gap-3 rounded-md border border-zinc-200 bg-white p-3" data-opportunity-card>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              {opportunityLabel(opportunity.type, locale)}
            </p>
            <h2 className="mt-1 line-clamp-2 font-semibold text-zinc-950" title={title}>{title}</h2>
          </div>
          <IconActionTooltip align="end" label={locale === "ro" ? "Nu afișa" : "Не показывать"}>
            <button
              aria-label={`${locale === "ro" ? "Nu afișa" : "Не показывать"}: ${title}`}
              className={compactActionClassName.icon}
              data-action-level="icon"
              disabled={pending}
              onClick={dismiss}
              type="button"
            >
              <EyeOff aria-hidden="true" className="size-4" />
            </button>
          </IconActionTooltip>
        </div>

        <p className="mt-2 text-sm text-zinc-700">
          {primaryReason(opportunity, locale)}
        </p>
        {opportunity.secondaryReasons.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {opportunity.secondaryReasons.map((reason) => (
              <span
                className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600"
                key={reason}
              >
                {secondaryReason(reason, locale)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap" data-opportunity-actions>
          <Link
            className={compactActionClassName.primary}
            data-action-level="primary"
            href={href}
            onClick={() => recordBehaviorInteraction({ eventName: template ? "opportunity_template_opened" : "opportunity_repeat_started", metadataSafe: { opportunityType: opportunity.type }, route: "/cabinet/opportunities", sourceSurface: "opportunity_card" })}
            prefetch={false}
          >
            {template ? locale === "ro" ? "Deschide seturile" : "Открыть комплекты" : locale === "ro" ? "Repetă achiziția" : "Повторить закупку"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {message ? (
          <p
            aria-live="polite"
            className="mt-2 text-sm font-medium text-emerald-700"
          >
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ProductOpportunityCard({
  alreadyInCart,
  canAddToOrder,
  canAddToSpecification,
  canManagePurchasingLists,
  companyId,
  dismiss,
  href,
  locale,
  message,
  opportunity,
  partnerPriceOnly,
  pending,
  title,
  userId,
}: {
  alreadyInCart?: boolean;
  canAddToOrder: boolean;
  canAddToSpecification: boolean;
  canManagePurchasingLists: boolean;
  companyId: string | null;
  dismiss: () => void;
  href: string;
  locale: PartnerLocale;
  message: string | null;
  opportunity: CommercialOpportunity;
  partnerPriceOnly: boolean;
  pending: boolean;
  title: string;
  userId: string | null;
}) {
  const product = opportunity.product!;
  return (
    <article className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-md border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50/30 lg:grid-cols-[6.5rem_minmax(0,1fr)_13rem]" data-opportunity-card data-opportunity-layout="horizontal-v2">
      <Link
        aria-label={`${locale === "ro" ? "Deschide produsul" : "Открыть товар"} ${product.name}`}
        className="relative flex size-[5.5rem] items-center justify-center self-start overflow-hidden rounded-md bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:size-[6.5rem]"
        data-opportunity-zone="image"
        href={href}
        prefetch={false}
      >
        <CatalogCardImage
          alt={`${product.name}, ${product.sku}`}
          sizes="(min-width: 1024px) 104px, 88px"
          src={product.reference?.thumbnail ?? product.imageUrl}
          variant="md"
        />
      </Link>

      <div className="min-w-0 self-start" data-opportunity-zone="information">
        <p className="text-[11px] font-semibold uppercase leading-[1.35] text-emerald-700" data-opportunity-status>
          {opportunityLabel(opportunity.type, locale)}
        </p>
        <p className="mt-1 min-w-0 text-[10px] font-medium leading-[1.35] text-zinc-500" data-opportunity-identity>
          <span className="whitespace-nowrap">SKU {product.sku}</span>
          <span aria-hidden="true"> · </span>
          <Link className="text-[13px] font-semibold text-zinc-950 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 [overflow-wrap:anywhere]" href={href} prefetch={false}>
            {title}
          </Link>
        </p>
        <div className="mt-2 text-[11px] leading-[1.35] text-zinc-700" data-opportunity-reason>
          {primaryReason(opportunity, locale)}
        </div>
        {opportunity.secondaryReasons.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5" data-opportunity-tags>
            {opportunity.secondaryReasons.map((reason) => (
              <span className={`rounded px-2 py-1 text-[10px] font-medium leading-none ${reason === "relevant_merchandising" ? "bg-sky-50 text-sky-800" : "bg-zinc-100 text-zinc-600"}`} key={reason}>
                {secondaryReason(reason, locale)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="col-span-2 min-w-0 border-t border-zinc-200 pt-3 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0" data-opportunity-zone="commercial">
        <div className="grid grid-cols-2 gap-3 text-[11px] leading-[1.35] lg:grid-cols-1 lg:gap-2">
          <div data-opportunity-price>{priceLabel(product, locale, partnerPriceOnly)}</div>
          <div className="tabular-nums" data-opportunity-availability>{availabilityLabel(product, locale)}</div>
        </div>
        {canAddToOrder && canAddProduct(opportunity) ? (
          <div className="mt-3" data-opportunity-primary-action>
            <CatalogQuantityCartAction
              initialQuantity={suggestedQuantity(opportunity)}
              productId={product.id}
              selectionProduct={opportunitySelectionProduct(opportunity, locale)}
              sourceSurface="opportunity_card"
              successEventName="opportunity_added_to_cart"
            />
          </div>
        ) : null}
        {alreadyInCart ? <p className="mt-2 text-[11px] font-semibold text-emerald-800">{locale === "ro" ? "Deja în coș" : "Уже в корзине"}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-opportunity-actions>
          {canManagePurchasingLists ? <FavoriteProductButton compact initialSaved={false} productId={product.id} /> : null}
          {canAddToSpecification ? <ProductSpecificationAction compact productId={product.id} /> : null}
          {companyId && userId ? <ProductComparisonAction categoryId={null} companyId={companyId} compact productId={product.id} userId={userId} /> : null}
          <IconActionTooltip align="end" label={locale === "ro" ? "Nu afișa" : "Не показывать"}>
            <button
              aria-label={`${locale === "ro" ? "Nu afișa" : "Не показывать"}: ${title}`}
              className={compactActionClassName.icon}
              data-action-level="icon"
              disabled={pending}
              onClick={dismiss}
              type="button"
            >
              <EyeOff aria-hidden="true" className="size-4" />
            </button>
          </IconActionTooltip>
        </div>
        {message ? <p aria-live="polite" className="mt-2 text-[11px] font-medium text-emerald-700">{message}</p> : null}
      </div>
    </article>
  );
}

function opportunityLabel(
  type: CommercialOpportunity["type"],
  locale: PartnerLocale,
): string {
  const ru = {
    repeat_purchase_available: "Вы покупаете регулярно",
    watched_product_back_in_stock: "Снова в наличии",
    relevant_product_arrival_confirmed: "Ожидается поступление",
    relevant_product_price_decreased: "Цена стала ниже",
    purchase_template_ready: "Комплект готов к заказу",
    previous_order_repeatable: "Можно повторить закупку",
    relevant_merchandising_offer: "Предложение Novotech",
    relevant_product_low_stock: "Осталось немного",
    source_product_low_stock_with_available_analog: "Доступен аналог",
    related_product: "Дополняющий товар",
  } satisfies Record<CommercialOpportunity["type"], string>;
  const ro = {
    repeat_purchase_available: "Cumpărați regulat",
    watched_product_back_in_stock: "Din nou în stoc",
    relevant_product_arrival_confirmed: "Recepție estimată",
    relevant_product_price_decreased: "Preț redus",
    purchase_template_ready: "Set gata de comandă",
    previous_order_repeatable: "Achiziția poate fi repetată",
    relevant_merchandising_offer: "Ofertă Novotech",
    relevant_product_low_stock: "Stoc limitat",
    source_product_low_stock_with_available_analog: "Analog disponibil",
    related_product: "Produs complementar",
  } satisfies Record<CommercialOpportunity["type"], string>;
  return (locale === "ro" ? ro : ru)[type];
}

function primaryReason(
  opportunity: CommercialOpportunity,
  locale: PartnerLocale,
) {
  const value = opportunity.reasonMetadata;
  if (locale === "ro") {
    if (opportunity.reasonCode === "related_to_regular_purchase")
      return <RelatedProductReason locale={locale} opportunity={opportunity} />;
    if (opportunity.reasonCode === "back_in_stock")
      return "Produsul din lista dvs. este din nou disponibil.";
    if (opportunity.reasonCode === "confirmed_arrival")
      return `Recepția a ${numberValue(value.expectedQuantity, locale)} buc. este confirmată pentru ${dateValue(value.expectedDate, locale)}.`;
    if (opportunity.reasonCode === "price_decreased")
      return `Prețul actual este cu ${numberValue(value.decreasePercent, locale)}% mai mic decât ultimul preț confirmat.`;
    if (opportunity.reasonCode === "repeat_purchase")
      return `Ultima achiziție — acum ${daysAgo(value.daysSinceLastPurchase, locale)}. De obicei: ${numberValue(value.typicalQuantity, locale)} buc.`;
    if (opportunity.reasonCode === "low_stock")
      return "Produsul cumpărat regulat are stoc redus.";
    if (opportunity.reasonCode === "available_analog")
      return "Produsul are stoc redus. Este disponibil un analog.";
    if (opportunity.reasonCode === "template_fully_ready")
      return `Toate cele ${numberValue(value.itemCount, locale)} poziții din set sunt disponibile.`;
    if (opportunity.reasonCode === "template_mostly_ready")
      return `${numberValue(value.availableCount, locale)} din ${numberValue(value.itemCount, locale)} poziții disponibile${Number(value.expectedCount) > 0 ? ` · ${numberValue(value.expectedCount, locale)} așteptate` : ""}`;
    if (opportunity.reasonCode === "previous_order_repeatable")
      return `${numberValue(value.eligibleCount, locale)} din ${numberValue(value.itemCount, locale)} poziții ale comenzii sunt din nou disponibile.`;
    if (opportunity.reasonCode === "relevant_merchandising")
      return "Ofertă actuală pentru un produs asociat activității dvs. de achiziție.";
    return "Condițiile comerciale pentru un produs relevant s-au modificat.";
  }
  if (opportunity.reasonCode === "related_to_regular_purchase")
    return <RelatedProductReason locale={locale} opportunity={opportunity} />;
  if (opportunity.reasonCode === "back_in_stock")
    return "Товар из вашего списка снова доступен.";
  if (opportunity.reasonCode === "confirmed_arrival")
    return `Поступление ${numberValue(value.expectedQuantity, locale)} шт. подтверждено на ${dateValue(value.expectedDate, locale)}.`;
  if (opportunity.reasonCode === "price_decreased")
    return `Текущая цена на ${numberValue(value.decreasePercent, locale)}% ниже предыдущей подтверждённой цены.`;
  if (opportunity.reasonCode === "repeat_purchase")
    return `Последняя покупка — ${daysAgo(value.daysSinceLastPurchase, locale)} назад. Обычно: ${numberValue(value.typicalQuantity, locale)} шт.`;
  if (opportunity.reasonCode === "low_stock")
    return "Товар, который вы регулярно покупаете, заканчивается на складе.";
  if (opportunity.reasonCode === "available_analog")
    return "Товар заканчивается. Доступен аналог.";
  if (opportunity.reasonCode === "template_fully_ready")
    return `Все ${numberValue(value.itemCount, locale)} позиций комплекта доступны.`;
  if (opportunity.reasonCode === "template_mostly_ready")
    return `${numberValue(value.availableCount, locale)} из ${numberValue(value.itemCount, locale)} позиций доступны${Number(value.expectedCount) > 0 ? ` · ${numberValue(value.expectedCount, locale)} ожидаются` : ""}`;
  if (opportunity.reasonCode === "previous_order_repeatable")
    return `Снова доступны ${numberValue(value.eligibleCount, locale)} из ${numberValue(value.itemCount, locale)} позиций заказа.`;
  if (opportunity.reasonCode === "relevant_merchandising")
    return `Актуальное предложение по товару, связанному с вашей закупочной активностью.`;
  return "Коммерческие условия по релевантному товару изменились.";
}

function RelatedProductReason({ locale, opportunity }: { locale: PartnerLocale; opportunity: CommercialOpportunity }) {
  const value = opportunity.reasonMetadata;
  const sourceName = textValue(value.sourceProductName);
  const sourceId = typeof value.sourceProductId === "string" ? value.sourceProductId : null;
  const governedSource = sourceId && opportunity.sourceProduct?.productId === sourceId
    ? opportunity.sourceProduct
    : null;
  const model = governedSource?.name || sourceName;
  const modelView = governedSource
    ? <Link className="font-semibold text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500" href={`/cabinet/catalog/${governedSource.slug}`} prefetch={false}>{model}</Link>
    : model;
  return <>{locale === "ro" ? "Completează " : "Дополнение к "}{modelView} · {numberValue(value.sourcePurchaseCount, locale)} {locale === "ro" ? "achiziții confirmate." : "подтверждённых закупок."}</>;
}

function secondaryReason(reason: string, locale: PartnerLocale): string {
  const ru = {
    repeat_purchase: "Покупали ранее",
    back_in_stock: "Снова доступен",
    confirmed_arrival: "Подтверждено поступление",
    low_stock: "Низкий остаток",
    relevant_merchandising: "Предложение Novotech",
  } as Record<string, string>;
  const ro = {
    repeat_purchase: "Achiziționat anterior",
    back_in_stock: "Din nou disponibil",
    confirmed_arrival: "Recepție confirmată",
    low_stock: "Stoc redus",
    relevant_merchandising: "Ofertă Novotech",
  } as Record<string, string>;
  return (locale === "ro" ? ro : ru)[reason] ?? reason;
}
function priceLabel(
  product: NonNullable<CommercialOpportunity["product"]>,
  locale: PartnerLocale,
  partnerOnly = false,
) {
  const price = product.partnerPrice ?? (partnerOnly ? null : product.retailPrice);
  return price ? (
    <p>
      {!product.partnerPrice ? <span className="block text-[10px] font-medium text-zinc-500">
        {locale === "ro"
            ? "Preț cu amănuntul"
            : "Розничная цена"}
      </span> : null}
      <strong aria-label={`${product.partnerPrice ? locale === "ro" ? "Preț de partener" : "Партнёрская цена" : locale === "ro" ? "Preț cu amănuntul" : "Розничная цена"}: ${formatPartnerMoney(price.amount, price.currency, locale)}`} className={`block text-base font-semibold tabular-nums ${product.partnerPrice ? "text-emerald-700" : "text-zinc-950"}`}>
        {formatPartnerMoney(price.amount, price.currency, locale)}
      </strong>
    </p>
  ) : (
    <p className="text-zinc-600">
      {locale === "ro" ? "Preț în curs de clarificare" : "Цена уточняется"}
    </p>
  );
}
function availabilityLabel(
  product: NonNullable<CommercialOpportunity["product"]>,
  locale: PartnerLocale,
) {
  if ((product.availableQuantity ?? 0) > 0 && (product.availableQuantity ?? 0) <= 5)
    return (
      <p>
        <span className="block text-[10px] font-medium text-zinc-500">
          {locale === "ro" ? "Disponibilitate" : "Наличие"}
        </span>
        <strong>
          {locale === "ro" ? "Stoc redus" : "Мало"}: {product.availableQuantity}{" "}
          {locale === "ro" ? "buc." : "шт."}
        </strong>
      </p>
    );
  if ((product.availableQuantity ?? 0) > 0)
    return (
      <p>
        <span className="block text-[10px] font-medium text-zinc-500">
          {locale === "ro" ? "Disponibilitate" : "Наличие"}
        </span>
        <strong>
          {locale === "ro" ? "În stoc" : "В наличии"}:{" "}
          {product.availableQuantity} {locale === "ro" ? "buc." : "шт."}
        </strong>
      </p>
    );
  if (product.expectedArrivalDate)
    return (
      <p>
        <span className="block text-[10px] font-medium text-zinc-500">
          {locale === "ro" ? "Recepție" : "Поступление"}
        </span>
        <strong className="inline-flex items-center gap-1">
          <CalendarClock className="size-4" />
          {dateValue(product.expectedArrivalDate, locale)}
        </strong>
      </p>
    );
  return (
    <p className="text-zinc-600">
      {locale === "ro"
        ? "Disponibilitate în curs de clarificare"
        : "Наличие уточняется"}
    </p>
  );
}
function suggestedQuantity(opportunity: CommercialOpportunity): number {
  const raw = Number(opportunity.reasonMetadata.typicalQuantity ?? 1);
  return Number.isInteger(raw) && raw >= 1 && raw <= 9999 ? raw : 1;
}
function canAddProduct(opportunity: CommercialOpportunity): boolean {
  const product = opportunity.product;
  if (!product) return false;
  if (
    opportunity.type !== "repeat_purchase_available"
    && opportunity.type !== "related_product"
  ) {
    return Boolean(product.partnerPrice || product.retailPrice);
  }
  return Boolean(
    product.partnerPrice
      && (product.availableQuantity ?? 0) > 0
  );
}
function opportunitySelectionProduct(opportunity: CommercialOpportunity, locale: PartnerLocale): LiveCommerceSelectionProduct {
  const product = opportunity.product!;
  const price = product.partnerPrice;
  const available = product.availableQuantity;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    imageUrl: product.reference?.thumbnail ?? product.imageUrl,
    partnerPrice: price ? {
      amount: price.amount,
      currencyCode: price.currency,
      formattedAmount: formatPartnerMoney(price.amount, price.currency, locale),
      lastUpdatedAt: null,
    } : null,
    stock: {
      status: typeof available === "number" && available > 5 ? "in_stock" : typeof available === "number" && available > 0 ? "low_stock" : product.expectedArrivalDate ? "expected" : "out_of_stock",
      label: typeof available === "number" && available > 0 ? String(available) : product.expectedArrivalDate ? "expected" : "unavailable",
      exactAvailableQuantity: available,
      lastUpdatedAt: null,
    },
  };
}
function textValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}
function daysAgo(value: unknown, locale: PartnerLocale): string {
  const parsed = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(parsed)) return "—";
  if (locale === "ro") return `${formatPartnerNumber(parsed, locale)} ${parsed === 1 ? "zi" : "de zile"}`;
  const mod10 = parsed % 10;
  const mod100 = parsed % 100;
  const unit = mod10 === 1 && mod100 !== 11
    ? "день"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "дня"
      : "дней";
  return `${formatPartnerNumber(parsed, locale)} ${unit}`;
}
function numberValue(value: unknown, locale: PartnerLocale): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatPartnerNumber(parsed, locale) : "—";
}
function dateValue(value: unknown, locale: PartnerLocale): string {
  if (typeof value !== "string")
    return locale === "ro" ? "data se confirmă" : "дата уточняется";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? locale === "ro"
      ? "data se confirmă"
      : "дата уточняется"
    : formatPartnerDate(date, locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}
