import { Suspense, type ReactNode } from "react";

import type { CatalogProductDetailDto } from "../services";
import type { PartnerLocale } from "../../partner-locale";
import { ProductDetailContextRail } from "./ProductDetailContextRail";
import { ProductDetailNavigation } from "./ProductDetailNavigation";

export function ProductDetailShell({
  canAddToOrder,
  canManagePurchasingLists,
  children,
  companyId,
  initialFavorite,
  locale,
  product,
  showAnalyticsTab,
  userId,
}: {
  canAddToOrder: boolean;
  canManagePurchasingLists: boolean;
  children: ReactNode;
  companyId: string | null;
  initialFavorite: boolean;
  locale: PartnerLocale;
  product: CatalogProductDetailDto;
  showAnalyticsTab: boolean;
  userId: string | null;
}) {
  return (
    <article className="space-y-4">
      <ProductDetailNavigation locale={locale} showAnalyticsTab={showAnalyticsTab} />
      <div
        className="grid gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-5"
        data-testid="product-detail-layout"
      >
        <ProductDetailContextRail
          canAddToOrder={canAddToOrder}
          canManagePurchasingLists={canManagePurchasingLists}
          companyId={companyId}
          initialFavorite={initialFavorite}
          locale={locale}
          product={product}
          userId={userId}
        />
        <div className="min-w-0" data-testid="product-detail-content">
          <Suspense fallback={<ProductTabFallback locale={locale} />}>{children}</Suspense>
        </div>
      </div>
    </article>
  );
}
function ProductTabFallback({ locale }: { locale: PartnerLocale }) {
  return (
    <div
      aria-label={locale === "ro" ? "Se încarcă secțiunea produsului" : "Загрузка раздела товара"}
      className="space-y-3"
      role="status"
    >
      <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="h-24 animate-pulse rounded bg-zinc-100" />
      <span className="sr-only">{locale === "ro" ? "Se încarcă" : "Загрузка"}</span>
    </div>
  );
}
