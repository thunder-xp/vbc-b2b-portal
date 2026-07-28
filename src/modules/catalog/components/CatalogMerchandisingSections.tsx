import type {
  CatalogMerchandisingSection,
} from "../actions/list-merchandising-sections.action";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import { ProductCard } from "./ProductCard";
import { CATALOG_PRODUCT_GRID_CLASS } from "./ProductGrid";
import { BehaviorTrackedCatalogLink, BehaviorViewEvent } from "../../behavior-analytics/components/BehaviorViewEvent";

export function CatalogMerchandisingSections({
  capabilities,
  commercialViews,
  companyId,
  sections,
  userId,
}: {
  capabilities: ProductCardCapabilityModel;
  commercialViews: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  sections: CatalogMerchandisingSection[];
  userId: string | null;
}) {
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
              {section.title}
            </h2>
            <BehaviorTrackedCatalogLink
              ariaLabel={`Показать все: ${section.title}`}
              className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              href={`/cabinet/catalog?label=${section.labelCode}`}
              sourceSurface={section.labelCode}
            >
              Показать все
            </BehaviorTrackedCatalogLink>
          </div>
          <div className={CATALOG_PRODUCT_GRID_CLASS}>
            {section.products.slice(0, 10).map((product) => (
              <ProductCard
                analyticsSurface={section.labelCode}
                capabilities={capabilities}
                commercialView={commercialViews[product.id]}
                companyId={companyId}
                key={product.id}
                product={product}
                userId={userId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
