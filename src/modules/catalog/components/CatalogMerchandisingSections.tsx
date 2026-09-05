import type {
  CatalogMerchandisingSection,
} from "../actions/list-merchandising-sections.action";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import { ProductCard } from "./ProductCard";
import { CATALOG_PRODUCT_GRID_CLASS } from "./ProductGrid";
import { BehaviorTrackedCatalogLink, BehaviorViewEvent } from "../../behavior-analytics/components/BehaviorViewEvent";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";

export function CatalogMerchandisingSections({
  capabilities,
  commercialViews,
  companyId,
  locale = "ru",
  sections,
  userId,
}: {
  capabilities: ProductCardCapabilityModel;
  commercialViews: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  locale?: PartnerLocale;
  sections: CatalogMerchandisingSection[];
  userId: string | null;
}) {
  const copy = getCatalogCopy(locale);
  if (!sections.length) return null;

  return (
    <div className="space-y-7" data-testid="catalog-merchandising-sections">
      {sections.map((section) => (
        <section aria-labelledby={`section-${section.labelCode}`} key={section.labelCode}>
          <BehaviorViewEvent
            dedupeKey={`merchandising-section:${section.labelCode}`}
            eventName="merchandising_section_viewed"
            route="/cabinet/catalog"
            sourceSurface={section.labelCode}
          />
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-950" id={`section-${section.labelCode}`}>
              {section.labelCode === "REPLENISHMENT" ? copy.latestArrival : section.title}
            </h2>
            <div className="inline-flex shrink-0 items-center gap-2">
              <ResponsiveRemainderBadge locale={locale} totalCount={section.totalCount} />
              <BehaviorTrackedCatalogLink
                ariaLabel={`${copy.showAll}: ${section.labelCode === "REPLENISHMENT" ? copy.latestArrival : section.title}`}
                className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                href={section.href ?? `/cabinet/catalog?label=${section.labelCode}`}
                sourceSurface={section.labelCode}
              >
                {copy.showAll}
              </BehaviorTrackedCatalogLink>
            </div>
          </div>
          <div className={CATALOG_PRODUCT_GRID_CLASS} data-testid={`catalog-showcase-grid-${section.labelCode}`}>
            {section.products.slice(0, 5).map((product, index) => (
              <div className={showcaseProductVisibilityClass(index)} data-showcase-product={index + 1} key={product.id}>
                <ProductCard
                  analyticsSurface={section.labelCode}
                  capabilities={capabilities}
                  commercialView={commercialViews[product.id]}
                  companyId={companyId}
                  contextBadge={section.labelCode === "REPLENISHMENT" ? copy.replenishment : section.contextBadge}
                  locale={locale}
                  product={product}
                  userId={userId}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function showcaseProductVisibilityClass(index: number): string {
  if (index === 0) return "min-w-0";
  if (index === 1) return "hidden min-w-0 sm:block";
  if (index < 4) return "hidden min-w-0 xl:block";
  return "hidden min-w-0 2xl:block";
}

export function responsiveShowcaseRemainders(totalCount: number) {
  return {
    mobile: Math.max(totalCount - 1, 0),
    tablet: Math.max(totalCount - 2, 0),
    desktop: Math.max(totalCount - 4, 0),
    wide: Math.max(totalCount - 5, 0),
  };
}

function ResponsiveRemainderBadge({ locale, totalCount }: { locale: PartnerLocale; totalCount: number }) {
  const remainders = responsiveShowcaseRemainders(totalCount);
  return <>
    <Remainder count={remainders.mobile} locale={locale} className="sm:hidden" />
    <Remainder count={remainders.tablet} locale={locale} className="hidden sm:inline-flex xl:hidden" />
    <Remainder count={remainders.desktop} locale={locale} className="hidden xl:inline-flex 2xl:hidden" />
    <Remainder count={remainders.wide} locale={locale} className="hidden 2xl:inline-flex" />
  </>;
}

function Remainder({ className, count, locale }: { className: string; count: number; locale: PartnerLocale }) {
  if (count <= 0) return null;
  return <span
    aria-label={locale === "ro" ? `Încă ${count} produse` : `Ещё товаров: ${count}`}
    className={`${className} min-h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1.5 text-[11px] font-bold tabular-nums text-white`}
    data-showcase-remainder={count}
  >{count}</span>;
}
