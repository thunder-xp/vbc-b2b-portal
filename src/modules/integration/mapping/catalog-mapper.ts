import type {
  CatalogBrandDTO,
  CatalogCategoryDTO,
  CatalogProductDTO,
} from "../dto";
import type { ERPMapper } from "./erp-mapper";

export interface CatalogMapper<
  TProductPayload,
  TCategoryPayload,
  TBrandPayload,
> {
  readonly productMapper: ERPMapper<TProductPayload, CatalogProductDTO>;
  readonly categoryMapper: ERPMapper<TCategoryPayload, CatalogCategoryDTO>;
  readonly brandMapper: ERPMapper<TBrandPayload, CatalogBrandDTO>;
}
