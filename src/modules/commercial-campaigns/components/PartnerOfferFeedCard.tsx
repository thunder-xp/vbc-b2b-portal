import Link from "next/link";
import { ProductThumbnail } from "@/src/modules/catalog/components/ProductThumbnail";
import { MerchandisingBadge } from "@/src/modules/catalog/components/MerchandisingBadges";
import {
  formatPartnerDate,
  type PartnerLocale,
} from "@/src/modules/partner-locale";
import type { PartnerOfferFeedItem } from "../offer-feed";
import type { CampaignProduct } from "../types";
import { CampaignPriceStack } from "./CampaignPriceStack";
import { CampaignCartControl } from "./CampaignCartControl";
import { CampaignCountdown } from "./CampaignCountdown";
import { CampaignBundleProgress } from "./CampaignBundleProgress";
import { CampaignCommercialSummary } from "./CampaignCommercialSummary";

export function PartnerOfferFeedCard({
  offer,
  locale,
  priority = false,
  rankPosition,
}: {
  offer: PartnerOfferFeedItem;
  locale: PartnerLocale;
  priority?: boolean;
  rankPosition?: number;
}) {
  const ro = locale === "ro",
    c = offer.campaign;
  const terms = `/cabinet/offers/${offer.campaignId}`;
  const reward = c.products.find(
    (p) => p.attachRole === "REWARD" || p.spendRole === "REWARD",
  );
  const composition =
    offer.kind === "BUNDLE" ? (offer.composition ?? offer.summary) : null;
  const thumbnails = c.products.filter((p) => p.imageUrl).slice(0, 4);
  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3"
      data-offer-id={offer.offerId}
      data-offer-kind={offer.kind}
      data-campaign-id={offer.campaignId}
      data-rank-position={rankPosition}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <MerchandisingBadge
          variant="SPECIAL_OFFER"
          label={ro ? "OFERTĂ SPECIALĂ" : "СПЕЦПРЕДЛОЖЕНИЕ"}
        />
        <CampaignCountdown
          remainingSeconds={offer.remainingSeconds}
          locale={locale}
          compact
        />
      </div>
      {offer.kind === "PRODUCT" ? (
        <>
          <div className="relative h-32">
            <ProductThumbnail
              priority={priority}
              alt={offer.product.name}
              src={offer.product.imageUrl}
              sizes="(max-width:767px) 100vw, (max-width:1279px) 40vw, 20vw"
              href={`/cabinet/catalog/${offer.product.slug}`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-500">SKU {offer.product.sku}</p>
            <h2 className="mt-1 break-words text-[13px] font-semibold leading-snug">
              <Link
                className="focus-visible:outline-2 focus-visible:outline-emerald-700"
                href={`/cabinet/catalog/${offer.product.slug}`}
                data-offer-open="product"
              >
                {offer.product.name}
              </Link>
            </h2>
          </div>
          {offer.mechanicType === "quantity_threshold_promo" &&
          offer.product.promoThresholdQuantity ? (
            <p className="text-[11px] font-medium text-zinc-700">
              {ro ? "Preț special de la" : "Спеццена от"}{" "}
              {offer.product.promoThresholdQuantity} {ro ? "buc." : "шт."}
            </p>
          ) : null}
          <CommercialBenefit product={offer.product} locale={locale} />
          <Stock product={offer.product} locale={locale} />
          <div className="mt-auto">
            {offer.directCart ? (
              <CampaignCartControl
                itemId={offer.product.itemId}
                publicationVersion={offer.publicationVersion}
                minimum={offer.product.minimumQuantity}
                maximum={offer.product.maximumQuantityPerCompany}
                mechanicType={offer.mechanicType}
                promoThresholdQuantity={offer.product.promoThresholdQuantity}
                promoPrice={offer.product.specialPrice}
                compact
              />
            ) : (
              <p className="text-[11px] text-zinc-600">
                {ro
                  ? "Condițiile comerciale se verifică"
                  : "Коммерческие условия уточняются"}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-zinc-600">
              {offer.kind === "BUNDLE"
                ? ro
                  ? "Set"
                  : "Набор"
                : offer.kind === "CONDITIONAL"
                  ? ro
                    ? "Ofertă condiționată"
                    : "Условное предложение"
                  : ro
                    ? "De la suma comenzii"
                    : "От суммы заказа"}
            </p>
            <h2 className="mt-1 break-words text-[13px] font-semibold leading-snug">
              {c.title}
            </h2>
          </div>
          {offer.kind === "BUNDLE" ? (
            <>
              {composition ? (
                <p className="text-[11px] text-zinc-600 tabular-nums">
                  {composition.skuCount} SKU · {composition.totalUnits}{" "}
                  {ro ? "buc." : "шт."}
                </p>
              ) : null}
              {thumbnails.length ? (
                <div
                  className="flex gap-2"
                  aria-label={ro ? "Produse în set" : "Товары набора"}
                >
                  {thumbnails.map((p) => (
                    <div key={p.itemId} className="relative size-12 shrink-0">
                      <ProductThumbnail
                        alt={p.name}
                        src={p.imageUrl}
                        sizes="48px"
                        variant="sm"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              {offer.summary ? (
                <CampaignCommercialSummary
                  summary={offer.summary}
                  locale={locale}
                  specialLabel={
                    ro ? "Preț special pentru set" : "Спеццена набора"
                  }
                />
              ) : (
                <p className="text-[11px] text-zinc-600">
                  {ro
                    ? "Condițiile comerciale se verifică"
                    : "Коммерческие условия уточняются"}
                </p>
              )}
              <CompoundStock
                products={c.products}
                locale={locale}
                ready={offer.progress?.stockReady}
              />
              <div className="mt-auto">
                {offer.progress ? (
                  <CampaignBundleProgress
                    compact
                    progress={offer.progress}
                    locale={locale}
                    mechanicType={offer.mechanicType}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <>
              {offer.kind === "CONDITIONAL" && offer.progress ? (
                <div className="grid gap-2 text-[11px] leading-snug">
                  <p className="font-semibold">
                    {ro ? "Cumpărați:" : "Купите:"}
                  </p>
                  {offer.progress.triggers.map((t) => (
                    <p key={t.campaignItemId} className="break-words">
                      {t.name} ·{" "}
                      <span className="font-medium tabular-nums">
                        {t.requiredTriggerQuantity} {ro ? "buc." : "шт."}
                      </span>
                    </p>
                  ))}
                  <p className="text-zinc-600 tabular-nums">
                    {ro ? "În coș" : "В корзине"}:{" "}
                    {offer.progress.triggers
                      .map(
                        (t) =>
                          `${t.currentQuantity} / ${t.requiredTriggerQuantity}`,
                      )
                      .join(" · ")}
                  </p>
                  <CompoundStock
                    products={c.products}
                    locale={locale}
                    ready={
                      offer.progress.triggerStockReady &&
                      offer.progress.rewardStockReady
                    }
                  />
                </div>
              ) : offer.kind === "SPEND_THRESHOLD" && offer.progress ? (
                <div className="grid gap-2 text-[11px] tabular-nums">
                  <p className="text-zinc-600">
                    {ro ? "La comenzi de la" : "При заказе от"}
                  </p>
                  <p className="text-lg font-semibold">
                    {offer.progress.thresholdAmountUsd} USD
                  </p>
                  <p className="text-zinc-600">
                    {ro ? "În coș" : "В корзине"}:{" "}
                    {offer.progress.qualifyingSpendUsd} /{" "}
                    {offer.progress.thresholdAmountUsd} USD
                  </p>
                  <p className="text-zinc-600">
                    {ro ? "Mai sunt" : "Осталось"}:{" "}
                    {offer.progress.remainingSpendUsd} USD
                  </p>
                </div>
              ) : null}
              <p className="text-[11px] font-semibold">
                {ro ? "Primiți:" : "Получите:"}
              </p>
              {reward ? (
                <>
                  <p className="break-words text-[13px] font-medium">
                    {reward.name}
                  </p>
                  <CommercialBenefit
                    product={reward}
                    locale={locale}
                    specialLabel={
                      ro
                        ? "La îndeplinirea condițiilor"
                        : "При выполнении условий"
                    }
                  />
                  <Stock product={reward} locale={locale} />
                </>
              ) : (
                <p className="text-[11px] text-zinc-600">{c.termsSummary}</p>
              )}
              <Link
                className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                href={terms}
                data-offer-open="detail"
              >
                {ro ? "Vezi condițiile" : "Посмотреть условия"}
              </Link>
            </>
          )}
        </>
      )}
      <Link
        className="text-[11px] text-zinc-600 underline underline-offset-2 focus-visible:outline-2"
        href={terms}
        prefetch={false}
        data-offer-open="detail"
      >
        {ro ? "Deschide oferta" : "Открыть предложение"}
      </Link>
    </article>
  );
}

function CompoundStock({
  products,
  locale,
  ready,
}: {
  products: CampaignProduct[];
  locale: PartnerLocale;
  ready?: boolean;
}) {
  const ro = locale === "ro",
    unknown = products.some((product) => product.availableQuantity === null);
  return (
    <p
      className={`text-[11px] ${unknown ? "text-zinc-600" : ready ? "text-emerald-800" : "text-amber-800"}`}
    >
      {unknown
        ? ro
          ? "Stocul se confirmă"
          : "Наличие уточняется"
        : ready
          ? ro
            ? "Stoc confirmat pentru ofertă"
            : "Наличие по условиям подтверждено"
          : ro
            ? "Verificați stocul pentru ofertă"
            : "Проверьте наличие по условиям"}
    </p>
  );
}

function CommercialBenefit({
  product,
  locale,
  specialLabel,
}: {
  product: CampaignProduct;
  locale: PartnerLocale;
  specialLabel?: string;
}) {
  return product.commercialSummary ? (
    <CampaignCommercialSummary
      summary={product.commercialSummary}
      locale={locale}
      specialLabel={specialLabel}
      normalLabel={locale === "ro" ? "Prețul dvs." : "Ваша цена"}
    />
  ) : (
    <CampaignPriceStack product={product} locale={locale} />
  );
}

function Stock({
  product,
  locale,
}: {
  product: CampaignProduct;
  locale: PartnerLocale;
}) {
  const ro = locale === "ro";
  return (
    <div className="text-[11px] tabular-nums">
      <p
        className={
          product.availableQuantity === null
            ? "text-zinc-600"
            : product.availableQuantity > 0
              ? "text-emerald-800"
              : "text-amber-800"
        }
      >
        {product.availableQuantity === null
          ? ro
            ? "Stocul se confirmă"
            : "Наличие уточняется"
          : `${ro ? "În stoc" : "В наличии"}: ${product.availableQuantity}`}
      </p>
      {product.expectedArrivalDate ? (
        <p className="mt-1 text-zinc-600">
          {ro ? "Sosire" : "Поступление"}:{" "}
          {formatPartnerDate(product.expectedArrivalDate, locale)}
        </p>
      ) : null}
    </div>
  );
}
