import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProductThumbnail } from "../ProductThumbnail";
import { classifyProductImageSource, normalizeProductImageUrl } from "../product-image-source";

vi.mock("next/image", () => ({
  default: ({ fill, priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    void fill;
    void priority;
    return createElement("img", props);
  },
}));

const THUMBNAIL = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_thumb.png?alt=media&token=public-token";

describe("ProductThumbnail", () => {
  it("renders an allowlisted thumbnail with dimensions and responsive sizes", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="Camera" sizes="80px" src={THUMBNAIL} /></div>);
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("sizes", "80px");
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("loading", "lazy");
    expect(classifyProductImageSource(THUMBNAIL)).toBe("thumbnail");
  });

  it("uses the local fallback for unapproved origins", () => {
    render(<div className="relative size-20"><ProductThumbnail alt="Camera" sizes="80px" src="https://attacker.example/camera.png" /></div>);
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("src", "/product-placeholder.svg");
    expect(normalizeProductImageUrl("https://attacker.example/camera.png")).toBeNull();
  });

  it("rejects arbitrary Firebase buckets and query parameters", () => {
    expect(normalizeProductImageUrl("https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/camera.png?alt=media")).toBeNull();
    expect(normalizeProductImageUrl(`${THUMBNAIL}&redirect=https://attacker.example`)).toBeNull();
  });
});
