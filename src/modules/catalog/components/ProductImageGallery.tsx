import type { CatalogProductImageDto } from "../services";
import { getCatalogCopy, type PartnerLocale } from "../../partner-locale";
import { ProductImage } from "./ProductImage";
import { MerchandisingBadges } from "./MerchandisingBadges";

type ProductImageGalleryProps = {
  images: CatalogProductImageDto[];
  productId: string;
  productName: string;
  fallbackImageUrl: string | null;
  merchandisingLabels?: import("../../merchandising/types").MerchandisingLabelCode[];
  locale?: PartnerLocale;
};

export function ProductImageGallery({
  images,
  productId,
  productName,
  fallbackImageUrl,
  merchandisingLabels = [],
  locale = "ru",
}: ProductImageGalleryProps) {
  const copy = getCatalogCopy(locale);
  const primaryImage =
    images.find((image) => image.isPrimary) ?? images[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
        <ProductImage alt={primaryImage?.altText ?? productName} key={`${productId}:${primaryImage?.id ?? fallbackImageUrl ?? "fallback"}`} priority sizes="(max-width: 1024px) 100vw, 420px" src={primaryImage?.url || fallbackImageUrl} />
        {merchandisingLabels.length ? <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)]"><MerchandisingBadges labelOverrides={{ HOT: copy.hot, NEW: copy.new, SPECIAL_OFFER: copy.special, TOP: copy.top }} labels={merchandisingLabels} productCollectionsLabel={copy.productCollections} /></div> : null}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              className="relative aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-50"
              key={`${productId}:${image.id}`}
            >
              <ProductImage alt={image.altText ?? productName} sizes="100px" src={image.url} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
