import type { ReactNode } from "react";

import { listFavoriteProductIdsAction } from "../../purchasing-lists/actions";
import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { PartnerLocale } from "../../partner-locale";
import type { CatalogProductCardDto, CatalogViewMode } from "../services";
import { CatalogViewModeShell } from "./CatalogViewModeShell";
import { ProductGrid } from "./ProductGrid";
import { ProductList, type ProductListCatalogState } from "./ProductList";

export async function CatalogPresentation({ capabilities, catalogState, commercialViews, companyId, contextBadge, emptyState, initialMode, locale, products, quickLinks, userId }: {
  capabilities: ProductCardCapabilityModel;
  catalogState: ProductListCatalogState;
  commercialViews: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  contextBadge?: string;
  emptyState?: ReactNode;
  initialMode: CatalogViewMode;
  locale: PartnerLocale;
  products: CatalogProductCardDto[];
  quickLinks?: ReactNode;
  userId: string | null;
}) {
  if (!products.length) return <>{emptyState}</>;

  const favoriteResult = capabilities.canManagePurchasingLists
    ? await listFavoriteProductIdsAction(products.map((product) => product.id))
    : null;
  const favoriteProductIds = favoriteResult?.success ? favoriteResult.data : [];
  const shared = { capabilities, catalogState, commercialViews, companyId, contextBadge, favoriteProductIds, locale, products, userId };

  return <CatalogViewModeShell
    cards={<ProductGrid {...shared} />}
    initialMode={initialMode}
    list={<ProductList {...shared} />}
    quickLinks={quickLinks}
  />;
}
