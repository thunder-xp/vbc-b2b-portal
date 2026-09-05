import { MobileQuickProductCommerce } from "@/src/modules/catalog/components/MobileQuickProductCommerce";
import { listPreviouslyPurchasedProductsAction } from "@/src/modules/orders/actions/previously-purchased-products.action";
import { listRecentRepeatableOrdersAction } from "@/src/modules/orders/actions/repeat-order-selection.actions";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { listLiveCommerceKitsAction } from "@/src/modules/purchasing-lists/actions";

export default async function QuickOrderPage({ searchParams }: { searchParams?: Promise<{ repeatOrder?: string | string[]; kit?: string | string[] }> }) {
  const [locale, workspaceResult, previouslyPurchasedResult, recentOrdersResult, kitsResult, resolvedSearchParams] = await Promise.all([
    getPartnerLocale(),
    getPartnerWorkspaceContextAction(),
    listPreviouslyPurchasedProductsAction({ limit: 5, offset: 0 }),
    listRecentRepeatableOrdersAction(),
    listLiveCommerceKitsAction(),
    searchParams,
  ]);
  return <MobileQuickProductCommerce
    canSelectProducts={Boolean(workspaceResult.success && (
      workspaceResult.data.capabilities.productCard.canAddToOrder
      || workspaceResult.data.capabilities.canCreateCommercialProposal
    ))}
    locale={locale}
    canViewKits={Boolean(workspaceResult.success && workspaceResult.data.capabilities.navigation.some((item) => item.key === "purchasing_lists" && item.availability === "available"))}
    canManageKits={Boolean(workspaceResult.success && workspaceResult.data.capabilities.productCard.canManagePurchasingLists)}
    initialKitId={typeof resolvedSearchParams?.kit === "string" ? resolvedSearchParams.kit : null}
    initialRepeatOrderId={typeof resolvedSearchParams?.repeatOrder === "string" ? resolvedSearchParams.repeatOrder : null}
    previouslyPurchased={previouslyPurchasedResult.success
      ? previouslyPurchasedResult.data
      : { items: [], totalCount: 0 }}
    recentOrders={recentOrdersResult.success ? recentOrdersResult.data : []}
    savedKits={kitsResult.success ? kitsResult.data : []}
  />;
}
