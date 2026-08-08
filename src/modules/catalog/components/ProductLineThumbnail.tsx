import { ProductThumbnail } from "./ProductThumbnail";

type ProductLineThumbnailProps = {
  href?: string;
  imageUrl: string | null;
  productName: string;
  size?: "compact" | "service" | "standard";
};

export function ProductLineThumbnail({ href, imageUrl, productName, size = "standard" }: ProductLineThumbnailProps) {
  const dimensions = {
    compact: "size-12 min-h-12 min-w-12 max-h-12 max-w-12",
    service: "size-16 min-h-16 min-w-16 max-h-16 max-w-16",
    standard: "size-14 min-h-14 min-w-14 max-h-14 max-w-14 sm:size-16 sm:min-h-16 sm:min-w-16 sm:max-h-16 sm:max-w-16",
  }[size];

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 ${dimensions}`}
      data-testid="product-line-thumbnail"
    >
      <ProductThumbnail
        alt={productName}
        className="object-contain p-1.5"
        href={href}
        sizes={size === "compact" ? "48px" : size === "service" ? "64px" : "(max-width: 639px) 56px, 64px"}
        src={imageUrl}
        variant={size === "compact" ? "xs" : "sm"}
      />
    </span>
  );
}
