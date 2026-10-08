import Link from "next/link";
import { ProductThumbnail } from "@/src/modules/catalog/components/ProductThumbnail";
import {
  formatPartnerDate,
  formatPartnerMoney,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import type { PartnerOfferFeedItem } from "../offer-feed";
import { CampaignPriceStack } from "./CampaignPriceStack";
import { CampaignCartControl } from "./CampaignCartControl";
import { CampaignCountdown } from "./CampaignCountdown";
import { CampaignBundleProgress } from "./CampaignBundleProgress";
import { CampaignCommercialSummary } from "./CampaignCommercialSummary";
export function PartnerOfferFeedCard({
  offer,
  locale,
  priority = false,
}: {
  offer: PartnerOfferFeedItem;
  locale: PartnerLocale;
  priority?: boolean;
}) {
  const ro = locale === "ro",
    c = offer.campaign;
  const terms = `/cabinet/offers/${offer.campaignId}`;
  const label =
    offer.kind === "BUNDLE"
      ? ro
        ? "Set"
        : "Комплект"
      : offer.kind === "CONDITIONAL"
        ? ro
          ? "Cumpără X → PROMO Y"
          : "Купи X → PROMO Y"
        : offer.kind === "SPEND_THRESHOLD"
          ? ro
            ? "Prag de achiziție"
            : "Порог закупки"
          : offer.mechanicType === "quantity_threshold_promo"
            ? ro
              ? "PROMO de la cantitate"
              : "PROMO от количества"
            : "PROMO";
  return (
    <article
      className="flex min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4"
      data-offer-id={offer.offerId}
      data-offer-kind={offer.kind}
    >
      <span className="text-[11px] font-semibold text-orange-800">{label}</span>
      {offer.kind === "PRODUCT" ? (
        <>
          <div className="relative my-3 h-36">
            <ProductThumbnail
              priority={priority}
              alt={offer.product.name}
              src={offer.product.imageUrl}
              sizes="(max-width:767px) 100vw, (max-width:1279px) 40vw, 22vw"
              href={`/cabinet/catalog/${offer.product.slug}`}
            />
          </div>
          <p className="text-[11px] text-zinc-500">SKU {offer.product.sku}</p>
          <h2 className="mt-1 break-words text-sm font-semibold">
            <Link
              className="focus-visible:outline-2 focus-visible:outline-emerald-700"
              href={`/cabinet/catalog/${offer.product.slug}`}
              data-offer-open="product"
            >
              {offer.product.name}
            </Link>
          </h2>
          <p className="mt-2 break-words text-[11px] text-zinc-600">
            {offer.campaignTitle}
          </p>
          <CampaignPriceStack product={offer.product} locale={locale} />
          {offer.product.commercialSummary?.markupFromRetail ? (
            <p className="mt-1 text-xs tabular-nums">
              {ro ? "Adaos față de retail" : "Наценка от розницы"}:{" "}
              {offer.product.commercialSummary.markupFromRetail}
            </p>
          ) : null}
          {offer.product.commercialSummary?.saving !== null &&
          offer.product.commercialSummary?.saving !== undefined ? (
            <p className="mt-1 text-xs font-medium tabular-nums">
              {ro ? "Economisire" : "Экономия"}:{" "}
              {formatPartnerMoney(
                Number(offer.product.commercialSummary.saving),
                offer.product.commercialSummary.currency,
                locale,
              )}
            </p>
          ) : null}
          {offer.product.commercialSummary?.retailTotal ? (
            <p className="mt-1 text-xs text-zinc-600 tabular-nums">
              {ro ? "Retail" : "Розница"}:{" "}
              {formatPartnerMoney(
                Number(offer.product.commercialSummary.retailTotal),
                "MDL",
                locale,
              )}
            </p>
          ) : null}
          <p className="mt-3 text-xs tabular-nums text-zinc-700">
            {offer.product.availableQuantity === null
              ? ro
                ? "Stocul se confirmă"
                : "Наличие уточняется"
              : `${ro ? "În stoc" : "В наличии"}: ${offer.product.availableQuantity}`}
          </p>
          {offer.product.expectedArrivalDate ? (
            <p className="mt-1 text-xs text-zinc-600">
              {ro ? "Sosire" : "Поступление"}:{" "}
              {formatPartnerDate(offer.product.expectedArrivalDate, locale)}
            </p>
          ) : null}
          <div className="mt-auto pt-3">
            <CampaignCountdown
              remainingSeconds={offer.remainingSeconds}
              locale={locale}
              compact
            />
            {offer.directCart ? (
              <CampaignCartControl
                itemId={offer.product.itemId}
                publicationVersion={offer.publicationVersion}
                minimum={offer.product.minimumQuantity}
                maximum={offer.product.maximumQuantityPerCompany}
                mechanicType={offer.mechanicType}
                promoThresholdQuantity={offer.product.promoThresholdQuantity}
                promoPrice={offer.product.specialPrice}
              />
            ) : (
              <p className="mt-3 text-xs text-zinc-600">
                {ro
                  ? "Condițiile comerciale se verifică"
                  : "Коммерческие условия уточняются"}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-2 break-words text-sm font-semibold">
            {offer.kind === "CONDITIONAL" && offer.progress
              ? `${ro ? "Cumpără" : "Купи"} ${offer.progress.triggers.map((t) => `${t.requiredTriggerQuantity} × ${t.name}`).join(" + ")} → PROMO ${offer.progress.reward?.name ?? ""}`
              : offer.kind === "SPEND_THRESHOLD" && offer.progress
                ? `${ro ? "Achiziție" : "Закупка"} ${offer.progress.thresholdAmountUsd} USD → PROMO ${offer.progress.reward?.name ?? ""}`
                : c.title}
          </h2>
          {offer.kind !== "BUNDLE" ? (
            <p className="mt-2 break-words text-[11px] text-zinc-600">
              {c.title}
            </p>
          ) : null}
          {offer.kind === "BUNDLE" && offer.summary ? (
            <p className="mt-2 text-xs tabular-nums">
              {offer.summary.skuCount} SKU · {offer.summary.totalUnits}{" "}
              {ro ? "buc." : "шт."}
            </p>
          ) : null}
          <ul className="my-3 grid gap-2">
            {c.products.map((p) => (
              <li key={p.itemId} className="flex min-w-0 items-center gap-2">
                <div className="relative size-10 shrink-0">
                  <ProductThumbnail
                    alt=""
                    src={p.imageUrl}
                    sizes="40px"
                    variant="sm"
                  />
                </div>
                <div className="min-w-0 text-xs">
                  <Link
                    className="break-words font-medium"
                    href={`/cabinet/catalog/${p.slug}`}
                    data-offer-open="product"
                  >
                    {p.name}
                  </Link>
                  <p className="text-[11px] text-zinc-600">
                    SKU {p.sku}
                    {offer.kind === "BUNDLE"
                      ? ` · ${p.requiredBundleQuantity} ${ro ? "buc." : "шт."}`
                      : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {offer.kind === "BUNDLE" ? (
            <>
              {offer.summary ? (
                <CampaignCommercialSummary
                  summary={offer.summary}
                  locale={locale}
                />
              ) : null}
              {offer.progress ? (
                <CampaignBundleProgress
                  compact
                  progress={offer.progress}
                  locale={locale}
                  mechanicType={offer.mechanicType}
                />
              ) : null}
            </>
          ) : offer.kind === "CONDITIONAL" && offer.progress ? (
            <div className="text-xs">
              <p>
                {ro ? "În coș" : "В корзине"}:{" "}
                {offer.progress.triggers
                  .map(
                    (t) =>
                      `${t.currentQuantity} / ${t.requiredTriggerQuantity}`,
                  )
                  .join(" · ")}
              </p>
              <p className="mt-1">
                {offer.progress.triggersSatisfied
                  ? ro
                    ? "PROMO deblocată"
                    : "PROMO открыта"
                  : ro
                    ? "Completați condițiile"
                    : "Дополните условия"}
              </p>
              <p className="mt-1">
                {offer.progress.triggerStockReady &&
                offer.progress.rewardStockReady
                  ? ro
                    ? "Stoc disponibil"
                    : "Наличие подтверждено"
                  : ro
                    ? "Verificați stocul"
                    : "Проверьте наличие"}
              </p>
            </div>
          ) : offer.kind === "SPEND_THRESHOLD" && offer.progress ? (
            <div className="text-xs tabular-nums">
              <p>
                {offer.progress.qualifyingSpendUsd} /{" "}
                {offer.progress.thresholdAmountUsd} USD
              </p>
              <p className="mt-1">
                {ro ? "Mai sunt" : "Осталось"}:{" "}
                {offer.progress.remainingSpendUsd} USD
              </p>
              <p className="mt-1">
                {offer.progress.rewardStockReady
                  ? ro
                    ? "Stoc disponibil"
                    : "Наличие подтверждено"
                  : ro
                    ? "Verificați stocul"
                    : "Проверьте наличие"}
              </p>
            </div>
          ) : null}
          <div className="mt-auto pt-3">
            <CampaignCountdown
              remainingSeconds={offer.remainingSeconds}
              locale={locale}
              compact
            />
            {offer.kind !== "BUNDLE" ? (
              <Link
                className="mt-3 inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-3 text-xs font-semibold focus-visible:outline-2"
                href={terms}
                data-offer-open="detail"
              >
                {ro ? "Deschide condițiile" : "Открыть условия"}
              </Link>
            ) : null}
          </div>
        </>
      )}
      <Link
        className="mt-3 text-[11px] text-zinc-600 underline underline-offset-2"
        href={terms}
        prefetch={false}
        data-offer-open="detail"
      >
        {ro ? "Condițiile campaniei" : "Условия кампании"}
      </Link>
    </article>
  );
}
