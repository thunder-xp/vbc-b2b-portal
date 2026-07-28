import type { listCatalogMerchandisingSectionsAction } from "@/src/modules/catalog/actions";
import { BehaviorViewEvent } from "@/src/modules/behavior-analytics/components";
import { CatalogMerchandisingSections } from "@/src/modules/catalog/components";
import { EmptyCatalog } from "@/src/modules/catalog/components/EmptyCatalog";
import { RESTRICTED_PRODUCT_CARD_CAPABILITIES } from "@/src/modules/catalog/components/product-card.model";
import type { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import type { ProductCommercialViewDto } from "@/src/modules/pricing-inventory";

export async function CuratedCatalogResults({
  merchandisingPromise,
  workspacePromise,
}: {
  merchandisingPromise: ReturnType<typeof listCatalogMerchandisingSectionsAction>;
  workspacePromise: ReturnType<typeof getPartnerWorkspaceContextAction>;
}) {
  const [merchandisingResult, workspaceResult] = await Promise.all([
    merchandisingPromise,
    workspacePromise,
  ]);

  if (!merchandisingResult.success) {
    return <EmptyCatalog message={merchandisingResult.message} title="Каталог временно недоступен" />;
  }

  return <div className="space-y-7">
    <BehaviorViewEvent
      dedupeKey="catalog:curated"
      eventName="catalog_viewed"
      resultCount={merchandisingResult.data.sections.reduce((count, section) => count + section.products.length, 0)}
      route="/cabinet/catalog"
      sourceSurface="curated_catalog"
    />
    <CatalogMerchandisingSections
      capabilities={workspaceResult.success ? workspaceResult.data.capabilities.productCard : RESTRICTED_PRODUCT_CARD_CAPABILITIES}
      commercialViews={createCommercialViewMap(merchandisingResult.data.commercialViews)}
      companyId={workspaceResult.success ? workspaceResult.data.companyId : null}
      sections={merchandisingResult.data.sections}
      userId={workspaceResult.success ? workspaceResult.data.userId : null}
    />
  </div>;
}

function createCommercialViewMap(views: ProductCommercialViewDto[]): Record<string, ProductCommercialViewDto> {
  return Object.fromEntries(views.map((view) => [view.productId, view]));
}
