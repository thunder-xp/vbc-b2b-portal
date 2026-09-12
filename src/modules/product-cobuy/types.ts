import type { ProductCommercialViewDto } from "../pricing-inventory";

export type ProductCoBuyCard = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageFit: "contain" | "cover";
  commercialView: ProductCommercialViewDto | null;
};
