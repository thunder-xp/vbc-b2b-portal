import type { ProductCommercialViewDto } from "../pricing-inventory";

export type ProductRelationType = "analog" | "related";

export type ProductRelationCard = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageFit: "contain" | "cover";
  sourcePriority: number;
  commercialView: ProductCommercialViewDto | null;
};

export type ProductRelationSections = {
  analogs: ProductRelationCard[];
  related: ProductRelationCard[];
  synchronizedAt: string | null;
};

export type ProductRelationSummary = {
  hasAnalogs: boolean;
  hasRelated: boolean;
};
