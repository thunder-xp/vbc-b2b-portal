"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { normalizeProductImageUrl } from "./product-image-source";

type ProductThumbnailProps = {
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  sizes: string;
  src: string | null;
  href?: string;
  fit?: "contain" | "cover";
  variant?: "xs" | "sm" | "md" | "lg";
};

export function ProductThumbnail({
  alt,
  className = "object-contain p-4",
  fallbackClassName,
  priority = false,
  sizes,
  src,
  href,
  fit,
  variant = "md",
}: ProductThumbnailProps) {
  const normalizedSrc = normalizeProductImageUrl(src);
  const requiresAuthenticatedBrowserRequest = normalizedSrc?.startsWith("/api/nomenclature/covers/") === true;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasImage = Boolean(normalizedSrc) && failedSrc !== normalizedSrc;
  const image = (
    <Image
      alt={alt}
      className={hasImage
        ? `${fit ? (fit === "cover" ? "object-cover" : "object-contain") : className} object-center`
        : (fallbackClassName ?? "object-contain p-3")}
      data-product-thumbnail={variant}
      fill
      loading={priority ? undefined : "lazy"}
      onError={() => setFailedSrc(normalizedSrc)}
      priority={priority}
      sizes={sizes}
      src={hasImage ? normalizedSrc! : "/product-placeholder.svg"}
      unoptimized={requiresAuthenticatedBrowserRequest}
    />
  );

  return href ? <Link aria-label={alt} className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-emerald-500" href={href} prefetch={false}>{image}</Link> : image;
}
