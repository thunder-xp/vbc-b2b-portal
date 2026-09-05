"use client";

import { ArrowRight, CalendarClock, EyeOff, ShoppingCart } from "lucide-react";
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
import { FavoriteProductButton } from "../../purchasing-lists/components/FavoriteProductButton";
import { dismissCommercialOpportunityAction } from "../actions/commercial-opportunity.actions";
import type { CommercialOpportunity } from "../types";

export function OpportunityCard({
  canAddToOrder = true,
  canAddToSpecification = true,
  canManagePurchasingLists = true,
  opportunity,
  locale = "ru",
}: {
  canAddToOrder?: boolean;
  canAddToSpecification?: boolean;
  canManagePurchasingLists?: boolean;
  opportunity: CommercialOpportunity;
  locale?: PartnerLocale;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [addedToSelection, setAddedToSelection] = useState(false);
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
      ? `/cabinet/purchase-templates/${template.id}`
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

  return (
    <article className="grid min-w-0 gap-4 border border-zinc-200 bg-white p-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
      {product ? (
        <Link
          aria-label={`${locale === "ro" ? "Deschide produsul" : "Открыть товар"} ${product.name}`}
          className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          href={href}
          prefetch={false}
        >
          <CatalogCardImage
            alt={`${product.name}, ${product.sku}`}
            sizes="112px"
            src={product.reference?.thumbnail ?? product.imageUrl}
            variant="md"
          />
        </Link>
      ) : (
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-zinc-100">
          <ShoppingCart aria-hidden="true" className="size-8 text-zinc-400" />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              {opportunityLabel(opportunity.type, locale)}
            </p>
            {product ? (
              <p className="mt-1 text-xs text-zinc-500">
                {locale === "ro" ? "Cod produs" : "Артикул"} {product.sku}
              </p>
            ) : null}
            <h2
              className="mt-1 line-clamp-2 font-semibold text-zinc-950"
              title={title}
            >
              {product ? (
                <Link
                  className="rounded hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  href={href}
                  prefetch={false}
                >
                  {title}
                </Link>
              ) : (
                title
              )}
            </h2>
          </div>
          <button
            aria-label={`${locale === "ro" ? "Nu afișa" : "Не показывать"}: ${title}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-500"
            disabled={pending}
            onClick={dismiss}
            title={locale === "ro" ? "Nu afișa" : "Не показывать"}
            type="button"
          >
            <EyeOff aria-hidden="true" className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-sm font-medium text-zinc-800">
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

        {product ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>{priceLabel(product, locale, partnerPriceOnly)}</div>
            <div>{availabilityLabel(product, locale)}</div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-start gap-2">
          {product && canAddToOrder && canAddProduct(opportunity, addedToSelection) ? (
            <div className="min-w-[15rem] flex-1">
              <CatalogQuantityCartAction
                initialQuantity={suggestedQuantity(opportunity)}
                onSuccess={() => {
                  setAddedToSelection(true);
                }}
                productId={product.id}
                selectionProduct={opportunitySelectionProduct(opportunity, locale)}
                sourceSurface="opportunity_card"
                successEventName="opportunity_added_to_cart"
              />
            </div>
          ) : null}
          {alreadyInCart ? (
            <p className="inline-flex min-h-11 items-center rounded-md bg-emerald-50 px-4 text-sm font-semibold text-emerald-800">
              {locale === "ro" ? "Deja în coș" : "Уже в корзине"}
            </p>
          ) : null}
          {addedToSelection ? (
            <p className="inline-flex min-h-11 items-center rounded-md bg-emerald-50 px-4 text-sm font-semibold text-emerald-800">
              {locale === "ro" ? "În selecție" : "В подборке"}
            </p>
          ) : null}
          {product && canManagePurchasingLists ? (
            <FavoriteProductButton
              initialSaved={false}
              productId={product.id}
            />
          ) : null}
          {product && canAddToSpecification ? (
            <ProductSpecificationAction productId={product.id} />
          ) : null}
          {!product ? (
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 focus-visible:ring-2 focus-visible:ring-emerald-500"
              href={href}
              onClick={() =>
                recordBehaviorInteraction({
                  eventName: template
                    ? "opportunity_template_opened"
                    : "opportunity_repeat_started",
                  metadataSafe: { opportunityType: opportunity.type },
                  route: "/cabinet/opportunities",
                  sourceSurface: "opportunity_card",
                })
              }
              prefetch={false}
            >
              {template
                ? locale === "ro"
                  ? "Verifică șablonul"
                  : "Проверить шаблон"
                : locale === "ro"
                  ? "Repetă achiziția"
                  : "Повторить закупку"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
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

function opportunityLabel(
  type: CommercialOpportunity["type"],
  locale: PartnerLocale,
): string {
  const ru = {
    repeat_purchase_available: "Вы покупаете регулярно",
    watched_product_back_in_stock: "Снова в наличии",
    relevant_product_arrival_confirmed: "Ожидается поступление",
    relevant_product_price_decreased: "Цена стала ниже",
    purchase_template_ready: "Шаблон готов к заказу",
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
    purchase_template_ready: "Șablon gata de comandă",
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
): string {
  const value = opportunity.reasonMetadata;
  if (locale === "ro") {
    if (opportunity.reasonCode === "related_to_regular_purchase")
      return `Selectat ca produs complementar pentru ${textValue(value.sourceProductName)}: ${numberValue(value.sourcePurchaseCount, locale)} comenzi confirmate ale companiei.`;
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
      return `Toate cele ${numberValue(value.itemCount, locale)} poziții din șablon sunt disponibile.`;
    if (opportunity.reasonCode === "template_mostly_ready")
      return `${numberValue(value.availableCount, locale)} din ${numberValue(value.itemCount, locale)} poziții sunt disponibile, iar ${numberValue(value.expectedCount, locale)} sunt așteptate.`;
    if (opportunity.reasonCode === "previous_order_repeatable")
      return `${numberValue(value.eligibleCount, locale)} din ${numberValue(value.itemCount, locale)} poziții ale comenzii sunt din nou disponibile.`;
    if (opportunity.reasonCode === "relevant_merchandising")
      return "Ofertă actuală pentru un produs asociat activității dvs. de achiziție.";
    return "Condițiile comerciale pentru un produs relevant s-au modificat.";
  }
  if (opportunity.reasonCode === "related_to_regular_purchase")
    return `Подобран как дополнение к ${textValue(value.sourceProductName)}: ${numberValue(value.sourcePurchaseCount, locale)} подтверждённых закупок компанией.`;
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
    return `Все ${numberValue(value.itemCount, locale)} позиций шаблона доступны.`;
  if (opportunity.reasonCode === "template_mostly_ready")
    return `${numberValue(value.availableCount, locale)} из ${numberValue(value.itemCount, locale)} позиций доступны, ещё ${numberValue(value.expectedCount, locale)} ожидаются.`;
  if (opportunity.reasonCode === "previous_order_repeatable")
    return `Снова доступны ${numberValue(value.eligibleCount, locale)} из ${numberValue(value.itemCount, locale)} позиций заказа.`;
  if (opportunity.reasonCode === "relevant_merchandising")
    return `Актуальное предложение по товару, связанному с вашей закупочной активностью.`;
  return "Коммерческие условия по релевантному товару изменились.";
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
      <span className="block text-xs text-zinc-500">
        {product.partnerPrice
          ? locale === "ro"
            ? "Prețul dvs."
            : "Ваша цена"
          : locale === "ro"
            ? "Preț cu amănuntul"
            : "Розничная цена"}
      </span>
      <strong>
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
        <span className="block text-xs text-zinc-500">
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
        <span className="block text-xs text-zinc-500">
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
        <span className="block text-xs text-zinc-500">
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
function canAddProduct(
  opportunity: CommercialOpportunity,
  addedToCart: boolean,
): boolean {
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
      && !addedToCart,
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
