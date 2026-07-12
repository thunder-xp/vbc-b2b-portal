import type { CatalogProductImageDto } from "../services";
import { ProductImage } from "./ProductImage";

type ProductImageGalleryProps = {
  images: CatalogProductImageDto[];
  productName: string;
  fallbackImageUrl: string | null;
};

export function ProductImageGallery({
  images,
  productName,
  fallbackImageUrl,
}: ProductImageGalleryProps) {
  const primaryImage =
    images.find((image) => image.isPrimary) ?? images[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
        <ProductImage alt={primaryImage?.altText ?? productName} sizes="(max-width: 1024px) 100vw, 420px" src={primaryImage?.url || fallbackImageUrl} />
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
              key={image.id}
            >
              <ProductImage alt={image.altText ?? productName} sizes="100px" src={image.url} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
