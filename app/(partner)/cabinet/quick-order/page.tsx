import { MobileQuickProductCommerce } from "@/src/modules/catalog/components/MobileQuickProductCommerce";
import { listPreviouslyPurchasedProductsAction } from "@/src/modules/orders/actions/previously-purchased-products.action";
import { listRecentRepeatableOrdersAction } from "@/src/modules/orders/actions/repeat-order-selection.actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function QuickOrderPage({ searchParams }: { searchParams?: Promise<{ repeatOrder?: string | string[] }> }) {
  const [locale, workspaceResult, previouslyPurchasedResult, recentOrdersResult, resolvedSearchParams] = await Promise.all([
    getPartnerLocale(),
    getPartnerWorkspaceContextAction(),
    listPreviouslyPurchasedProductsAction({ limit: 5, offset: 0 }),
    listRecentRepeatableOrdersAction(),
    searchParams,
  ]);
  return <MobileQuickProductCommerce
    canSelectProducts={Boolean(workspaceResult.success && (
      workspaceResult.data.capabilities.productCard.canAddToOrder
      || workspaceResult.data.capabilities.canCreateCommercialProposal
    ))}
    locale={locale}
    initialRepeatOrderId={typeof resolvedSearchParams?.repeatOrder === "string" ? resolvedSearchParams.repeatOrder : null}
    previouslyPurchased={previouslyPurchasedResult.success
      ? previouslyPurchasedResult.data
      : { items: [], totalCount: 0 }}
    recentOrders={recentOrdersResult.success ? recentOrdersResult.data : []}
  />;
}
