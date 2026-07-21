import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductLineThumbnail } from "../ProductLineThumbnail";

vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <span aria-label={alt || undefined} data-src={src} role={alt ? "img" : "presentation"} /> }));

describe("ProductLineThumbnail", () => {
  it("keeps fixed dimensions and meaningful product alt text", () => {
    render(<ProductLineThumbnail imageUrl="https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_thumb.jpg?alt=media" productName="Camera" />);
    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass("size-14", "sm:size-16");
    expect(screen.getByRole("img", { name: "Camera" })).toBeInTheDocument();
  });

  it("uses the shared neutral fallback without duplicating adjacent product text", () => {
    render(<ProductLineThumbnail imageUrl={null} productName="Camera" />);
    expect(screen.getByRole("presentation")).toHaveAttribute("data-src", "/product-placeholder.svg");
  });
});
