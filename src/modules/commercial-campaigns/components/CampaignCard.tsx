import { CampaignCountdown } from "./CampaignCountdown";
import { CampaignCommercialSummary } from "./CampaignCommercialSummary";
import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  formatPartnerDate,
  secondaryCopy,
  type PartnerLocale,
} from "@/src/modules/partner-locale";

import { CampaignBundleProgress } from "./CampaignBundleProgress";
import { CampaignSpendProgress } from "./CampaignSpendProgress";
import { CampaignAttachProgress } from "./CampaignAttachProgress";
import type { PartnerCampaign } from "../types";

export function CampaignCard({
  campaign,
  locale = "ru",
}: {
  campaign: PartnerCampaign;
  locale?: PartnerLocale;
}) {
  const copy = secondaryCopy(locale);
  const stocked = campaign.products.filter(
    (product) => (product.availableQuantity ?? 0) > 0,
  ).length;
  const arriving = campaign.products.filter(
    (product) => product.expectedArrivalDate,
  ).length;
  const featuredProduct = campaign.mechanicType === "legacy_promo"
    ? campaign.products.find((product) => product.commercialSummary)
    : undefined;
  return (
    <article className="grid min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm sm:grid-cols-[11rem_1fr]">
      <div className="relative aspect-[16/9] bg-zinc-100 p-3 sm:aspect-auto sm:min-h-48">
        {campaign.imageAssetPath ? (
          <Image
            alt=""
            className="object-contain p-3"
            fill
            sizes="(max-width:640px) 100vw,176px"
            src={campaign.imageAssetPath}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400">
            <PackageCheck aria-hidden="true" className="size-10" />
          </div>
        )}
      </div>
      <div className="min-w-0 p-5">
        <p className="text-xs font-semibold uppercase text-emerald-700">
          {copy.specialOffer}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-zinc-950">
          {campaign.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
          {campaign.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-700">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock
              aria-hidden="true"
              className="size-4 text-emerald-700"
            />
            {copy.availableUntil} {formatPartnerDate(campaign.endsAt, locale)}
          </span>
          {stocked ? (
            <span className="inline-flex items-center gap-1.5">
              <PackageCheck aria-hidden="true" className="size-4" />
              {copy.inStock}: {stocked}
            </span>
          ) : null}
          {arriving ? (
            <span className="inline-flex items-center gap-1.5">
              <Truck aria-hidden="true" className="size-4" />
              {copy.arriving}: {arriving}
            </span>
          ) : null}
        </div>
        {campaign.timeState === "ACTIVE" ? <CampaignCountdown remainingSeconds={campaign.remainingSeconds ?? 0} locale={locale} compact /> : null}
        <p className="mt-2 text-xs text-zinc-600">{campaign.mechanicType === "bundle_special_price" ? locale === "ro" ? "Set la preț special" : "Набор по спеццене" : campaign.mechanicType === "legacy_promo" ? "PROMO" : campaign.mechanicType === "fixed_bundle_promo" ? locale === "ro" ? "Set → PROMO" : "Комплект → PROMO" : campaign.mechanicType === "quantity_threshold_promo" ? locale === "ro" ? "Cantitate → PROMO" : "Количество → PROMO" : campaign.mechanicType === "conditional_attach_promo" ? locale === "ro" ? "Cumpără X → PROMO pentru Y" : "Купи X → PROMO на Y" : locale === "ro" ? "Sumă → PROMO" : "Сумма закупки → PROMO"}</p>
        {campaign.commercialSummary ? <><p className="my-2 text-xs">{campaign.commercialSummary.skuCount} SKU · {campaign.commercialSummary.totalUnits} {locale === "ro" ? "buc." : "шт."}</p><CampaignCommercialSummary summary={campaign.commercialSummary} locale={locale} /></> : null}
        {featuredProduct?.commercialSummary ? (
          <div className="mt-4 rounded-md border border-zinc-200 p-3" data-testid="campaign-featured-product">
            <p className="text-sm font-semibold text-zinc-900">{featuredProduct.name}</p>
            <p className="mb-3 text-xs text-zinc-600">SKU {featuredProduct.sku}</p>
            <CampaignCommercialSummary summary={featuredProduct.commercialSummary} locale={locale} />
          </div>
        ) : null}
        {campaign.bundleProgress ? <CampaignBundleProgress progress={campaign.bundleProgress} mechanicType={campaign.mechanicType} locale={locale} /> : null}
        {campaign.attachProgress ? <CampaignAttachProgress progress={campaign.attachProgress} locale={locale} /> : null}
        {campaign.spendProgress ? <CampaignSpendProgress progress={campaign.spendProgress} locale={locale} /> : null}
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          href={`/cabinet/offers/${campaign.id}`}
          prefetch={false}
        >
          {copy.openOffer}
        </Link>
      </div>
    </article>
  );
}
