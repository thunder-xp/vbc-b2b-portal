import type { ProductImageFit } from "../components/product-image-source";

export type ProductPublicationState = "published" | "unavailable";

export type ProductReferenceDto = {
  productId: string;
  slug: string;
  sku: string;
  name: string;
  thumbnail: string | null;
  thumbnailFit: ProductImageFit;
  publicationState: ProductPublicationState;
  status?: string;
};
