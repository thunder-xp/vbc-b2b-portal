import { ProductThumbnail } from "./ProductThumbnail";
import { resolveProductImageFit } from "./product-image-source";

export function CatalogCardImage({
  alt,
  priority = false,
  sizes = "(max-width: 639px) calc(100vw - 2rem), (max-width: 1279px) 40vw, 260px",
  src,
}: {
  alt: string;
  priority?: boolean;
  sizes?: string;
  src: string | null;
}) {
  const fit = resolveProductImageFit(src);

  return (
    <ProductThumbnail
      alt={alt}
      className={`${fit === "cover" ? "object-cover" : "object-contain"} object-center`}
      fallbackClassName="object-contain p-8"
      priority={priority}
      sizes={sizes}
      src={src}
    />
  );
}
