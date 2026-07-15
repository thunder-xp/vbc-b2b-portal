import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductImageGallery } from "../ProductImageGallery";

vi.mock("next/image", () => ({ default: ({ fill: _fill, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => <img {...props} /> }));

describe("ProductImageGallery identity", () => {
  it("resets failed image state when product identity changes", () => {
    const { rerender } = render(<ProductImageGallery fallbackImageUrl="/one.jpg" images={[]} productId="one" productName="One" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "/product-placeholder.svg");
    rerender(<ProductImageGallery fallbackImageUrl="/two.jpg" images={[]} productId="two" productName="Two" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/two.jpg");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Two");
  });
});
