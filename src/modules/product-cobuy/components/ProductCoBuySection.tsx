import { Info } from "lucide-react";
import type { ComponentProps } from "react";

import { ProductCard } from "../../catalog/components/ProductCard";
import type { CatalogProductCardDto } from "../../catalog/services";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import { IconActionTooltip } from "../../platform-ui/IconActionTooltip";
import type { getProductCoBuyRecommendationsAction } from "../actions/product-cobuy.action";
import type { ProductCoBuyCard } from "../types";

type ProductCoBuySectionProps = {
  cards: ProductCoBuyCard[];
  capabilities: ProductCardCapabilityModel;
  companyId?: string | null;
  locale?: PartnerLocale;
  userId?: string | null;
};

export function ProductCoBuySection({
  cards,
  capabilities,
  companyId = null,
  locale = "ru",
  userId = null,
}: ProductCoBuySectionProps) {
  const visibleCards = cards.slice(0, 5);
  if (!visibleCards.length) return null;
  const copy = getCatalogCopy(locale);

  return (
    <section
      aria-labelledby="product-cobuy-heading"
      className="pb-10"
      data-testid="product-cobuy-section"
    >
      <div className="mb-4 flex items-center gap-1">
        <h2
          className="text-xl font-semibold text-zinc-950"
          id="product-cobuy-heading"
        >
          {copy.partnerCoBuyTitle}
        </h2>
        <IconActionTooltip
          align="end"
          label={copy.partnerCoBuyPrivacyTooltip}
          wrap
        >
          <span
            aria-label={copy.partnerCoBuyPrivacyTooltip}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-emerald-600"
            tabIndex={0}
            title={copy.partnerCoBuyPrivacyTooltip}
          >
            <Info aria-hidden="true" className="h-4 w-4" />
          </span>
        </IconActionTooltip>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleCards.map((card) => (
          <ProductCard
            capabilities={capabilities}
            commercialView={card.commercialView ?? undefined}
            companyId={companyId}
            key={card.id}
            locale={locale}
            product={toProductCard(card)}
            userId={userId}
            variant="cobuy"
          />
        ))}
      </div>
    </section>
  );
}

export async function DeferredProductCoBuySection({
  resultPromise,
  ...sectionProps
}: Omit<ComponentProps<typeof ProductCoBuySection>, "cards"> & {
  resultPromise: Promise<
    Awaited<ReturnType<typeof getProductCoBuyRecommendationsAction>> | null
  >;
}) {
  const result = await resultPromise;
  if (!result?.success || !result.data.length) return null;

  return <ProductCoBuySection {...sectionProps} cards={result.data} />;
}

function toProductCard(card: ProductCoBuyCard): CatalogProductCardDto {
  return {
    id: card.id,
    sku: card.sku,
    name: card.name,
    slug: card.slug,
    shortDescription: null,
    imageUrl: card.imageUrl,
    brand: null,
    category: null,
    keyCharacteristics: [],
    datasheet: null,
  };
}
