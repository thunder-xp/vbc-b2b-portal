import { ProductThumbnail } from "./ProductThumbnail";

type ProductLineThumbnailProps = {
  imageUrl: string | null;
  productName: string;
  size?: "compact" | "standard";
};

export function ProductLineThumbnail({ imageUrl, productName, size = "standard" }: ProductLineThumbnailProps) {
  const dimensions = size === "compact" ? "size-12" : "size-14 sm:size-16";

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 ${dimensions}`}
      data-testid="product-line-thumbnail"
    >
      <ProductThumbnail
        alt={imageUrl ? productName : ""}
        className="object-contain p-1.5"
        sizes={size === "compact" ? "48px" : "(max-width: 639px) 56px, 64px"}
        src={imageUrl}
      />
    </span>
  );
}
