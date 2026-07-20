import Image from "next/image";

import { normalizeProductImageUrl } from "./product-image-source";

type ProductThumbnailProps = {
  alt: string;
  className?: string;
  priority?: boolean;
  sizes: string;
  src: string | null;
};

export function ProductThumbnail({
  alt,
  className = "object-contain p-4",
  priority = false,
  sizes,
  src,
}: ProductThumbnailProps) {
  return (
    <Image
      alt={alt}
      className={className}
      fill
      loading={priority ? undefined : "lazy"}
      priority={priority}
      quality={70}
      sizes={sizes}
      src={normalizeProductImageUrl(src) ?? "/product-placeholder.svg"}
    />
  );
}

