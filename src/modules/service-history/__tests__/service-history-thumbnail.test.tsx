import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OneCServiceHistorySummary, UnifiedServiceHistoryList } from "../components";
import type { OneCServiceHistoryDetail, UnifiedServiceHistoryItem } from "../types";

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

const detail: OneCServiceHistoryDetail = {
  id: "history-1",
  number: "NSUU-000229",
  date: "2026-08-01T10:00:00Z",
  status: "accepted",
  sourceStatus: "Accepted",
  product: { id: "product-1", sku: "190023", name: "Camera", imageUrl: baseItem.productImageUrl, href: baseItem.productHref },
  maskedSerial: "0MP***002",
  reportedFault: "No image",
  resolution: null,
  warrantyState: "covered",
  warrantyStartDate: null,
  warrantyEndDate: null,
  serviceCenter: null,
  updatedAt: "2026-08-01T10:00:00Z",
  events: [],
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

  it("bounds mapped detail images at 96px mobile and 120px desktop", () => {
    render(<OneCServiceHistorySummary detail={detail} />);

    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass(
      "size-24",
      "max-h-24",
      "max-w-24",
      "sm:size-30",
      "sm:max-h-30",
      "sm:max-w-30",
      "overflow-hidden",
      "relative",
    );
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("data-src", baseItem.productImageUrl);
  });

  it("keeps a broken detail image inside the same bounded fallback", () => {
    render(<OneCServiceHistorySummary detail={{ ...detail, product: { ...detail.product, imageUrl: "https://invalid.example/image.jpg", href: null } }} />);

    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass("size-24", "sm:size-30", "overflow-hidden");
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("data-src", "/product-placeholder.svg");
    expect(screen.queryByRole("link", { name: "Camera" })).not.toBeInTheDocument();
  });
});
