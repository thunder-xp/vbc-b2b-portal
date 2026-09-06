import type { ProductCommercialViewDto, ProductPriceViewDto } from "./pricing-inventory.service";

export type RetailPricePresentationDto = {
  partnerPrice: ProductPriceViewDto | null;
  partnerPriceMdl: ProductPriceViewDto | null;
  retailPriceMdl: ProductPriceViewDto | null;
  msrpPriceUsd: ProductPriceViewDto | null;
};

export function projectRetailPricePresentation(
  commercialView?: ProductCommercialViewDto | null,
): RetailPricePresentationDto {
  return {
    partnerPrice: commercialView?.partnerPrice ?? null,
    partnerPriceMdl: commercialView?.partnerPriceMdl ?? null,
    retailPriceMdl: commercialView?.retailPrice ?? null,
    msrpPriceUsd: commercialView?.msrpPriceUsd ?? null,
  };
}
