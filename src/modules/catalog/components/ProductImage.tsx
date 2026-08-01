import { ProductThumbnail } from "./ProductThumbnail";

export function ProductImage({ alt, priority = false, src, sizes = "(max-width: 768px) 100vw, 320px" }: { alt: string; priority?: boolean; src: string | null; sizes?: string }) {
  return <ProductThumbnail alt={alt} className="object-contain p-4" priority={priority} sizes={sizes} src={src} variant="lg" />;
}
