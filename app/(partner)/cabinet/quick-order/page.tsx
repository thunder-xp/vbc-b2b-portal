import { MobileQuickProductCommerce } from "@/src/modules/catalog/components/MobileQuickProductCommerce";
import { getQuickOrderCartStateAction } from "@/src/modules/orders/actions/cart.actions";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function QuickOrderPage() {
  const [locale, cartResult] = await Promise.all([
    getPartnerLocale(),
    getQuickOrderCartStateAction(),
  ]);
  return <MobileQuickProductCommerce
    canAddToOrder={cartResult.success}
    initialCartQuantities={cartResult.success ? cartResult.data.productQuantities : {}}
    initialCartUnitCount={cartResult.success ? cartResult.data.totalUnitCount : 0}
    locale={locale}
  />;
}
