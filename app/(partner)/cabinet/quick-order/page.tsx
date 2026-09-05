import { MobileQuickProductCommerce } from "@/src/modules/catalog/components/MobileQuickProductCommerce";
import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function QuickOrderPage() {
  const [locale, workspaceResult] = await Promise.all([
    getPartnerLocale(),
    getPartnerWorkspaceContextAction(),
  ]);
  return <MobileQuickProductCommerce
    canSelectProducts={Boolean(workspaceResult.success && (
      workspaceResult.data.capabilities.productCard.canAddToOrder
      || workspaceResult.data.capabilities.canCreateCommercialProposal
    ))}
    locale={locale}
  />;
}
