export function ProductImage({
  alt,
  priority = false,
  src,
}: {
  alt: string;
  priority?: boolean;
  src: string | null;
  sizes?: string;
}) {
  return <img
    alt={alt}
    className="absolute inset-0 size-full object-contain p-4"
    decoding="async"
    fetchPriority={priority ? "high" : "auto"}
    loading={priority ? "eager" : "lazy"}
    src={src || "/product-placeholder.svg"}
  />;
}
