import { MobileQuickProductCommerce } from "@/src/modules/catalog/components/MobileQuickProductCommerce";
import { listPreviouslyPurchasedProductsAction } from "@/src/modules/orders/actions/previously-purchased-products.action";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function QuickOrderPage() {
  const [locale, workspaceResult, previouslyPurchasedResult] = await Promise.all([
    getPartnerLocale(),
    getPartnerWorkspaceContextAction(),
    listPreviouslyPurchasedProductsAction({ limit: 5, offset: 0 }),
  ]);
  return <MobileQuickProductCommerce
    canSelectProducts={Boolean(workspaceResult.success && (
      workspaceResult.data.capabilities.productCard.canAddToOrder
      || workspaceResult.data.capabilities.canCreateCommercialProposal
    ))}
    locale={locale}
    previouslyPurchased={previouslyPurchasedResult.success
      ? previouslyPurchasedResult.data
      : { items: [], totalCount: 0 }}
  />;
}
