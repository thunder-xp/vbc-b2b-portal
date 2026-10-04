import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPartnerCampaignAction } from "@/src/modules/commercial-campaigns/actions";
import { CampaignAttachProgress, CampaignBundleProgress, CampaignCartControl, CampaignPriceStack } from "@/src/modules/commercial-campaigns/components";
import { ProductThumbnail } from "@/src/modules/catalog/components";
import {
  formatPartnerDate,
  secondaryCopy,
} from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const [{ campaignId }, locale] = await Promise.all([
    params,
    getPartnerLocale(),
  ]);
  const copy = secondaryCopy(locale);
  const result = await getPartnerCampaignAction(campaignId);
  if (!result.success) notFound();
  const campaign = result.data;
  return (
    <div className="space-y-6">
      <header className="grid overflow-hidden rounded-md border border-zinc-200 bg-white lg:grid-cols-[minmax(0,1fr)_24rem]" data-partner-page-header>
        <div className="p-6">
          <Link
            className="text-sm font-semibold text-emerald-700"
            href="/cabinet/offers"
          >
            ← {copy.allOffers}
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase text-emerald-700">
            {copy.specialOffer}
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            {campaign.title}
          </h1>
          <p className="mt-3 max-w-3xl text-zinc-600">{campaign.description}</p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
            <CalendarClock className="size-4" />
            {copy.availableUntil} {formatPartnerDate(campaign.endsAt, locale)}
          </p>
        </div>
        {campaign.imageAssetPath ? (
          <div className="relative min-h-56 bg-zinc-100 p-4 sm:min-h-64">
            <Image
              alt=""
              className="object-contain p-4"
              fill
              priority
              sizes="(max-width:1024px) 100vw,384px"
              src={campaign.imageAssetPath}
            />
          </div>
        ) : null}
      </header>
      {campaign.bundleProgress ? <CampaignBundleProgress progress={campaign.bundleProgress} locale={locale} /> : null}
      {campaign.attachProgress ? <CampaignAttachProgress progress={campaign.attachProgress} locale={locale} /> : null}
      <section aria-labelledby="campaign-products">
        <h2 className="text-xl font-semibold" id="campaign-products">
          {copy.offerProducts}
        </h2>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {campaign.products.map((product) => (
            <article
              className="grid min-w-0 gap-4 rounded-md border border-zinc-200 bg-white p-4 sm:grid-cols-[7rem_1fr]"
              key={product.itemId}
            >
              <div className="relative aspect-square overflow-hidden rounded border border-zinc-100 bg-zinc-50">
                <ProductThumbnail
                  alt={product.name}
                  className="object-contain p-2"
                  sizes="112px"
                  src={product.imageUrl}
                  variant="md"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-500">
                  SKU {product.sku}
                </p>
                <Link
                  className="mt-1 block font-semibold text-zinc-950 hover:text-emerald-700"
                  href={`/cabinet/catalog/${product.slug}`}
                  prefetch={false}
                >
                  {product.name}
                </Link>
                <CampaignPriceStack locale={locale} product={product} />
                <p className="mt-2 flex items-center gap-1.5 text-sm">
                  {(product.availableQuantity ?? 0) > 0 ? (
                    <>
                      <PackageCheck className="size-4 text-emerald-700" />
                      {copy.inStock}: {product.availableQuantity} {copy.units}
                    </>
                  ) : product.expectedArrivalDate ? (
                    <>
                      <Truck className="size-4 text-amber-700" />
                      {copy.expected} —{" "}
                      {formatPartnerDate(product.expectedArrivalDate, locale)}
                    </>
                  ) : (
                    <>{copy.availabilityPending}</>
                  )}
                </p>
                {product.partnerMessage ? (
                  <p className="mt-2 text-sm text-zinc-600">
                    {product.partnerMessage}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-zinc-500">
                  {campaign.mechanicType === "conditional_attach_promo" ? product.attachRole === "TRIGGER" ? `${locale === "ro" ? "Condiție" : "Условие"}: ${product.requiredTriggerQuantity}` : locale === "ro" ? "Produs cu PROMO" : "Товар с PROMO" : campaign.mechanicType === "fixed_bundle_promo" ? `${locale === "ro" ? "Cantitate în set" : "Количество в комплекте"}: ${product.requiredBundleQuantity}` : `${copy.minimum}: ${product.minimumQuantity}`} {campaign.mechanicType === "conditional_attach_promo" && product.attachRole === "REWARD" ? "" : copy.units}
                  {product.maximumQuantityPerCompany
                    ? ` · ${copy.companyLimit}: ${product.maximumQuantityPerCompany} ${copy.units}`
                    : ""}
                </p>
                {campaign.mechanicType !== "conditional_attach_promo" || product.attachRole === "TRIGGER" ? <CampaignCartControl
                  itemId={product.itemId}
                  maximum={product.maximumQuantityPerCompany}
                  mechanicType={product.mechanicType}
                  minimum={product.minimumQuantity}
                  promoPrice={product.specialPrice}
                  promoThresholdQuantity={product.promoThresholdQuantity}
                /> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-md border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="font-semibold">{copy.terms}</h2>
        <p className="mt-2 text-sm text-zinc-700">{campaign.termsSummary}</p>
        <p className="mt-2 text-sm text-zinc-600">{copy.stockDisclaimer}</p>
      </section>
    </div>
  );
}
