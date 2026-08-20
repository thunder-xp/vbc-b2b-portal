"use client";

import { useEffect, useState } from "react";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto, CatalogViewMode } from "../services";
import { listFavoriteProductIdsAction } from "../../purchasing-lists/actions";
import { ProductGrid } from "./ProductGrid";
import { ProductList } from "./ProductList";
import { CatalogViewSwitcher } from "./CatalogViewSwitcher";

export function CatalogPresentation({ capabilities, commercialViews, companyId, contextBadge, initialMode, products, userId }: {
  capabilities: ProductCardCapabilityModel;
  commercialViews: Record<string, ProductCommercialViewDto>;
  companyId: string | null;
  contextBadge?: string;
  initialMode: CatalogViewMode;
  products: CatalogProductCardDto[];
  userId: string | null;
}) {
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
    <div className="flex justify-end"><CatalogViewSwitcher mode={mode} onChange={setMode} /></div>
    {mode === "list"
      ? <ProductList capabilities={capabilities} commercialViews={commercialViews} companyId={companyId} contextBadge={contextBadge} favoriteProductIds={favoriteProductIds} products={products} userId={userId} />
      : <ProductGrid capabilities={capabilities} commercialViews={commercialViews} companyId={companyId} contextBadge={contextBadge} favoriteProductIds={favoriteProductIds} products={products} userId={userId} />}
  </div>;
}
