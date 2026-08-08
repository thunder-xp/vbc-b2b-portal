import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UnifiedServiceHistoryList } from "../components";
import type { UnifiedServiceHistoryItem } from "../types";

vi.mock("next/image", () => ({ default: ({ alt, className, src }: { alt: string; className: string; src: string }) => <span aria-label={alt} className={className} data-src={src} role="img" /> }));

const baseItem: UnifiedServiceHistoryItem = {
  id: "history-1",
  sourceType: "one_c",
  number: "NSUU-000229",
  date: "2026-08-01T10:00:00Z",
  status: "accepted",
  productId: "product-1",
  productSku: "190023",
  productName: "Camera",
  productImageUrl: "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera.jpg?alt=media",
  productHref: "/cabinet/catalog/camera",
  maskedSerial: "0MP***002",
  reportedFault: null,
  warrantyState: "covered",
  warrantyEndDate: null,
  updatedAt: "2026-08-01T10:00:00Z",
  href: "/cabinet/service/history/history-1",
};

function renderList(item: UnifiedServiceHistoryItem) {
  return render(<UnifiedServiceHistoryList page={{ items: [item], page: 1, total: 1 }} />);
}

describe("service history product thumbnails", () => {
  it("renders a mapped product as a bounded thumbnail with canonical product links", () => {
    renderList(baseItem);

    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass(
      "size-16",
      "min-h-16",
      "min-w-16",
      "max-h-16",
      "max-w-16",
      "overflow-hidden",
    );
    const productLinks = screen.getAllByRole("link", { name: "Camera" });
    expect(productLinks).toHaveLength(2);
    for (const link of productLinks) expect(link).toHaveAttribute("href", "/cabinet/catalog/camera");
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute("href", baseItem.href);
  });

  it("keeps missing and unresolved product fallbacks bounded and non-clickable", () => {
    renderList({ ...baseItem, productId: null, productHref: null, productImageUrl: null, productName: "Архивный товар" });

    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass("size-16", "max-h-16", "max-w-16", "overflow-hidden");
    expect(screen.getByRole("img", { name: "Архивный товар" })).toHaveAttribute("data-src", "/product-placeholder.svg");
    expect(screen.queryByRole("link", { name: "Архивный товар" })).not.toBeInTheDocument();
  });

  it("contains no full-row image sizing that can expand the mobile card", () => {
    const { container } = renderList({ ...baseItem, productImageUrl: "https://invalid.example/image.jpg", productHref: null });
    const thumbnail = screen.getByTestId("product-line-thumbnail");

    expect(thumbnail.className).not.toContain("w-full");
    expect(thumbnail.className).not.toContain("h-full");
    expect(container.querySelector("li > a")).not.toBeInTheDocument();
    expect(container.querySelector("li > div")).toHaveClass("grid-cols-[64px_minmax(0,1fr)]");
  });
});
