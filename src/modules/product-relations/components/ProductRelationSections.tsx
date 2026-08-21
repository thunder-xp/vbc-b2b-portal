import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import { BehaviorViewEvent } from "../../behavior-analytics/components";
import { ProductCard } from "../../catalog/components/ProductCard";
import type { CatalogProductCardDto } from "../../catalog/services";
import type { ProductRelationCard, ProductRelationSections } from "../types";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

type Props = {
  sourceProductId: string;
  sourceSlug: string;
  sourceStock?: ProductCommercialViewDto["stock"];
  sections: ProductRelationSections;
  capabilities: ProductCardCapabilityModel;
  companyId?: string | null;
  userId?: string | null;
  locale?: PartnerLocale;
};

export function ProductRelationSectionsView({
  capabilities,
  companyId,
  sections,
  sourceProductId,
  sourceSlug,
  sourceStock,
  userId,
  locale = "ru",
}: Props) {
  const copy = getCatalogCopy(locale);
  if (!sections.analogs.length && !sections.related.length) {
    return (
      <section aria-label={copy.relations} className="rounded-md border border-zinc-200 bg-zinc-50 p-6 text-center" data-testid="product-relations-empty-state">
        <p className="text-sm text-zinc-600">{copy.relationsEmpty}</p>
      </section>
    );
  }
  const promotion = relationPromotionMessage(sourceStock?.status, sections.analogs.length, locale);
  return (
    <div className="space-y-8" data-testid="product-relations-tab-content">
      {sections.analogs.length ? (
        <RelationSection
          cards={sections.analogs}
          capabilities={capabilities}
          companyId={companyId}
          description={promotion}
          sourceProductId={sourceProductId}
          sourceSlug={sourceSlug}
          locale={locale}
          title={copy.analogProducts}
          type="analog"
          userId={userId}
        />
      ) : null}
      {sections.related.length ? (
        <RelationSection
          cards={sections.related}
          capabilities={capabilities}
          companyId={companyId}
          sourceProductId={sourceProductId}
          sourceSlug={sourceSlug}
          locale={locale}
          title={copy.relatedProducts}
          type="related"
          userId={userId}
        />
      ) : null}
    </div>
  );
}

export function relationPromotionMessage(
  status: ProductCommercialViewDto["stock"] extends infer T
    ? T extends { status: infer S } ? S | undefined : undefined
    : undefined,
  analogCount: number,
  locale: PartnerLocale = "ru",
): string | null {
  if (analogCount < 1) return null;
  const copy = getCatalogCopy(locale);
  switch (status) {
    case "low_stock": return copy.analogLowStock;
    case "out_of_stock": return copy.analogOutOfStock;
    case "expected": return copy.analogExpected;
    default: return null;
  }
}

function RelationSection({
  capabilities,
  cards,
  companyId,
  description,
  sourceProductId,
  sourceSlug,
  title,
  type,
  userId,
  locale,
}: {
  capabilities: ProductCardCapabilityModel;
  cards: ProductRelationCard[];
  companyId?: string | null;
  description?: string | null;
  sourceProductId: string;
  sourceSlug: string;
  title: string;
  type: "analog" | "related";
  userId?: string | null;
  locale: PartnerLocale;
}) {
  const surface = type === "analog" ? "product_analog" : "product_related";
  return (
    <section aria-labelledby={`${type}-products-heading`}>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-zinc-950" id={`${type}-products-heading`}>{title}</h2>
        {description ? <p className="mt-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">{description}</p> : null}
      </div>
      <BehaviorViewEvent
        dedupeKey={`relations:${type}:${sourceProductId}`}
        eventName={type === "analog" ? "product_analog_section_viewed" : "product_related_section_viewed"}
        metadataSafe={{ relationCount: cards.length }}
        productId={sourceProductId}
        route={`/cabinet/catalog/${sourceSlug}`}
        sourceSurface={surface}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <ProductCard
            analyticsEventName={type === "analog" ? "product_analog_opened" : "product_related_opened"}
            analyticsSurface={surface}
            capabilities={capabilities}
            cartSuccessEventName={type === "analog" ? "product_analog_added_to_cart" : "product_related_added_to_cart"}
            commercialView={card.commercialView ?? undefined}
            companyId={companyId}
            key={`${type}:${card.id}`}
            locale={locale}
            product={toProductCard(card)}
            userId={userId}
          />
        ))}
      </div>
    </section>
  );
}

function toProductCard(card: ProductRelationCard): CatalogProductCardDto {
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
