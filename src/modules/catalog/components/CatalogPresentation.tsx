"use client";

import { useState } from "react";

import type { ProductCardCapabilityModel } from "../../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../../pricing-inventory";
import type { CatalogProductCardDto, CatalogViewMode } from "../services";
import { ProductGrid } from "./ProductGrid";
import { ProductList } from "./ProductList";
import { CatalogViewSwitcher } from "./CatalogViewSwitcher";

export function CatalogPresentation({ capabilities, commercialViews, initialMode, products }: {
  capabilities: ProductCardCapabilityModel;
  commercialViews: Record<string, ProductCommercialViewDto>;
  initialMode: CatalogViewMode;
  products: CatalogProductCardDto[];
}) {
  const [mode, setMode] = useState(initialMode);
  return <div className="space-y-3">
    <div className="flex justify-end"><CatalogViewSwitcher mode={mode} onChange={setMode} /></div>
    {mode === "list"
      ? <ProductList capabilities={capabilities} commercialViews={commercialViews} products={products} />
      : <ProductGrid capabilities={capabilities} commercialViews={commercialViews} products={products} />}
  </div>;
}
