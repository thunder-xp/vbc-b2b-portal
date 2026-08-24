import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProductThumbnail } from "../ProductThumbnail";
import { classifyProductImageSource, normalizeProductImageUrl, resolveProductImageFit } from "../product-image-source";
import nextConfig from "../../../../../next.config";

vi.mock("next/image", () => ({
  default: ({ fill, priority, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) => {
    void fill;
    void priority;
    return createElement("img", { ...props, "data-unoptimized": String(Boolean(unoptimized)) });
  },
}));

const THUMBNAIL = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_thumb.png?alt=media&token=public-token";

describe("ProductThumbnail", () => {
  it("allows every image quality emitted by catalog components", () => {
    expect(nextConfig.images?.qualities).toEqual(expect.arrayContaining([70, 75]));
  });

  it("renders an allowlisted thumbnail with dimensions and responsive sizes", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="Camera" sizes="80px" src={THUMBNAIL} /></div>);
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("sizes", "80px");
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("loading", "lazy");
    expect(classifyProductImageSource(THUMBNAIL)).toBe("thumbnail");
    expect(resolveProductImageFit(THUMBNAIL)).toBe("contain");
  });

  it("loads private nomenclature covers directly in the authenticated browser", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="External item" sizes="80px" src="/api/nomenclature/covers/11111111-1111-1111-1111-111111111111" /></div>);
    expect(screen.getByRole("img", { name: "External item" })).toHaveAttribute("data-unoptimized", "true");
    expect(screen.getByRole("img", { name: "External item" })).toHaveAttribute("src", "/api/nomenclature/covers/11111111-1111-1111-1111-111111111111");
  });

  it("uses cover only for explicitly crop-composed thumbnails", () => {
    const cropThumbnail = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_crop_thumb.png?alt=media&token=public-token";
    expect(resolveProductImageFit(cropThumbnail)).toBe("cover");
    expect(resolveProductImageFit("https://attacker.example/camera_crop_thumb.png")).toBe("contain");
  });

  it("uses the local fallback for unapproved origins", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="Camera" className="object-cover" fallbackClassName="object-contain p-8" sizes="80px" src="https://attacker.example/camera.png" /></div>);
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("src", "/product-placeholder.svg");
    expect(screen.getByRole("img", { name: "Camera" })).toHaveClass("object-contain", "p-8");
    expect(normalizeProductImageUrl("https://attacker.example/camera.png")).toBeNull();
  });

  it("rejects arbitrary Firebase buckets and query parameters", () => {
    expect(normalizeProductImageUrl("https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/camera.png?alt=media")).toBeNull();
    expect(normalizeProductImageUrl(`${THUMBNAIL}&redirect=https://attacker.example`)).toBeNull();
  });

  it("accepts only the governed normalized-image bucket", () => {
    expect(normalizeProductImageUrl("https://psfbmdfezgyruscqbqbn.supabase.co/storage/v1/object/public/catalog-normalized-images/product/image.webp"))
      .toContain("catalog-normalized-images/product/image.webp");
    expect(normalizeProductImageUrl("https://psfbmdfezgyruscqbqbn.supabase.co/storage/v1/object/public/other/image.webp")).toBeNull();
  });

  it("replaces a broken approved source with the local placeholder", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="Camera 400123" sizes="80px" src={THUMBNAIL} /></div>);
    fireEvent.error(screen.getByRole("img", { name: "Camera 400123" }));
    expect(screen.getByRole("img", { name: "Camera 400123" })).toHaveAttribute("src", "/product-placeholder.svg");
  });
});
