import Image from "next/image";

import { normalizeProductImageUrl } from "./product-image-source";

type ProductThumbnailProps = {
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  sizes: string;
  src: string | null;
};

export function ProductThumbnail({
  alt,
  className = "object-contain p-4",
  fallbackClassName,
  priority = false,
  sizes,
  src,
}: ProductThumbnailProps) {
  const normalizedSrc = normalizeProductImageUrl(src);

  return (
    <Image
      alt={alt}
      className={normalizedSrc ? className : (fallbackClassName ?? className)}
      fill
      loading={priority ? undefined : "lazy"}
      priority={priority}
      quality={70}
      sizes={sizes}
      src={normalizedSrc ?? "/product-placeholder.svg"}
    />
  );
}
