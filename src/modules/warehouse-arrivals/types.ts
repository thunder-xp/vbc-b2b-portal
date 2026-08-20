import type { CatalogProductCardDto } from "../catalog/services";
import type { PartnerWorkspaceContext } from "../partner-cabinet/services";
import type { ProductCommercialViewDto } from "../pricing-inventory";

export type WarehouseArrivalFilters = {
  from?: string;
  to?: string;
  brandId?: string;
  categoryId?: string;
  availability?: "all" | "in_stock" | "out_of_stock";
  unseenOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type WarehouseArrivalSummary = {
  id: string;
  completedAt: string;
  productCount: number;
  availableProductCount: number;
  availableUnits: number;
  seen: boolean;
};

export type WarehouseArrivalPage = {
  items: WarehouseArrivalSummary[];
  totalCount: number;
  page: number;
  totalPages: number;
};

export type WarehouseArrivalDetail = {
  id: string;
  completedAt: string;
  productCount: number;
  seen: boolean;
  products: CatalogProductCardDto[];
  commercialViews: ProductCommercialViewDto[];
};

export type WarehouseArrivalPageData = {
  arrival: WarehouseArrivalDetail;
  companyId: string;
  userId: string;
  productCardCapabilities: PartnerWorkspaceContext["capabilities"]["productCard"];
};
