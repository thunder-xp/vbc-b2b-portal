import type { CatalogProductImageDto } from "../services";

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
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 p-6">
        {primaryImage?.url || fallbackImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={primaryImage?.altText ?? productName}
            className="max-h-full max-w-full object-contain"
            src={primaryImage?.url || fallbackImageUrl || ""}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-zinc-300 text-center text-sm font-medium text-zinc-500">
            Product image
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div
              className="flex aspect-square items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 p-2"
              key={image.id}
            >
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={image.altText ?? productName}
                  className="max-h-full max-w-full object-contain"
                  src={image.url}
                />
              ) : (
                <span className="text-xs text-zinc-400">Image</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
