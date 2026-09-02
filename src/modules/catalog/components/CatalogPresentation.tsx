"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto, CatalogViewMode } from "../services";
import { listFavoriteProductIdsAction } from "../../purchasing-lists/actions";
import { ProductGrid } from "./ProductGrid";
import { ProductList } from "./ProductList";
import type { ProductListCatalogState } from "./ProductList";
import { CatalogViewSwitcher } from "./CatalogViewSwitcher";
import { usePartnerLocale } from "../../partner-locale";

export function CatalogPresentation({ capabilities, catalogState, commercialViews, companyId, contextBadge, emptyState, initialMode, products, quickLinks, userId }: {
  capabilities: ProductCardCapabilityModel;
  catalogState: ProductListCatalogState;
  commercialViews: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  contextBadge?: string;
  emptyState?: ReactNode;
  initialMode: CatalogViewMode;
  products: CatalogProductCardDto[];
  quickLinks?: ReactNode;
  userId: string | null;
}) {
  const locale = usePartnerLocale();
  const [mode, setMode] = useState(initialMode);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  useEffect(() => {
    if (!capabilities.canManagePurchasingLists || !products.length) return;
    let active = true;
    void listFavoriteProductIdsAction(products.map((product) => product.id)).then((result) => {
      if (active && result.success) setFavoriteProductIds(result.data);
    });
    return () => { active = false; };
  }, [capabilities.canManagePurchasingLists, products]);
  return <div className="space-y-3">
    <div className="flex min-w-0 items-center gap-2" data-testid="catalog-results-toolbar">
      <div className="min-w-0 flex-1">{quickLinks}</div>
      <div className="shrink-0"><CatalogViewSwitcher mode={mode} onChange={setMode} /></div>
    </div>
    {!products.length ? emptyState : mode === "list"
      ? <ProductList capabilities={capabilities} catalogState={catalogState} commercialViews={commercialViews} companyId={companyId} contextBadge={contextBadge} favoriteProductIds={favoriteProductIds} locale={locale} products={products} userId={userId} />
      : <ProductGrid capabilities={capabilities} catalogState={catalogState} commercialViews={commercialViews} companyId={companyId} contextBadge={contextBadge} favoriteProductIds={favoriteProductIds} locale={locale} products={products} userId={userId} />}
  </div>;
}
