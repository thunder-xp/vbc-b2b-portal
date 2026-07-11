import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolveWorkspaceCapabilities } from "../../../partner-cabinet/services";
import { ProductCard } from "../ProductCard";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const product = {
  id: "product-1",
  sku: "NV-100",
  name: "IP Camera",
  slug: "ip-camera",
  shortDescription: "Professional camera",
  imageUrl: null,
  brand: { id: "brand-1", name: "Novotech", slug: "novotech", description: null, logoUrl: null },
  category: { id: "category-1", parentId: null, name: "Cameras", slug: "cameras", description: null },
};

const commercialView = {
  productId: "product-1",
  price: { currency: "MDL", amount: 100, label: "100 MDL" },
  stock: { status: "expected" as const, label: "Expected", availableQuantity: 0, expectedQuantity: 12, expectedAt: "2026-07-20T00:00:00.000Z", warehouseCount: 2, lastUpdatedAt: "2026-07-11T00:00:00.000Z" },
  isDemoData: false,
};

describe("ProductCard workspace context", () => {
  it("shows permitted partner price, price type, stock, warehouses, and arrival context", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view", "prices.view", "stock.view"])).productCard;
    const { container } = render(<ProductCard capabilities={capabilities} commercialView={commercialView} priceTypeName="GOLD" product={product} />);

    expect(screen.getByText("100 MDL")).toBeInTheDocument();
    expect(screen.getByText("Вид цены: GOLD")).toBeInTheDocument();
    expect(screen.getByText(/2 склад/)).toBeInTheDocument();
    expect(screen.getByText(/Ожидается: 12/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });

  it("does not render price or stock when role permissions deny them", () => {
    const capabilities = resolveWorkspaceCapabilities(new Set(["catalog.view"])).productCard;
    render(<ProductCard capabilities={capabilities} commercialView={commercialView} priceTypeName="GOLD" product={product} />);

    expect(screen.queryByText("100 MDL")).not.toBeInTheDocument();
    expect(screen.queryByText("Expected")).not.toBeInTheDocument();
  });
});
