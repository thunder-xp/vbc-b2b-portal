import { ProductThumbnail } from "./ProductThumbnail";

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
  return <ProductThumbnail alt={alt} priority={priority} sizes={sizes} src={src} />;
}
