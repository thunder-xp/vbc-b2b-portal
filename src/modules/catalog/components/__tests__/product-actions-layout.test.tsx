import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductActions } from "../ProductActions";

vi.mock("../CatalogQuantityCartAction", () => ({
  CatalogQuantityCartAction: () => <button type="button">В подборку</button>,
}));
vi.mock("../../../purchasing-lists/components/FavoriteProductButton", () => ({
  FavoriteProductButton: ({ compact }: { compact?: boolean }) => <button data-compact={compact} type="button">Избранное</button>,
}));
vi.mock("../ProductSpecificationAction", () => ({
  ProductSpecificationAction: ({ compact }: { compact?: boolean }) => <button data-compact={compact} type="button">В смету</button>,
}));
vi.mock("../ProductComparisonAction", () => ({
  ProductComparisonAction: ({ compact }: { compact?: boolean }) => <button data-compact={compact} type="button">В сравнение</button>,
}));

describe("ProductActions layout", () => {
  it("keeps the primary action and compact secondary actions in one wrapping row", () => {
    render(<ProductActions canAddToOrder canManagePurchasingLists categoryId="category-1" companyId="company-1" product={{ id: "product-1", sku: "400540", name: "Camera", slug: "camera", imageUrl: null } as never} userId="user-1" />);

    expect(screen.getByLabelText("Действия с товаром")).toHaveClass("flex", "flex-wrap", "items-end");
    expect(screen.getByLabelText("Дополнительные действия")).toHaveClass("min-h-11", "items-center");
    expect(screen.getByRole("button", { name: "В подборку" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Избранное" })).toHaveAttribute("data-compact", "true");
    expect(screen.getByRole("button", { name: "В смету" })).toHaveAttribute("data-compact", "true");
    expect(screen.getByRole("button", { name: "В сравнение" })).toHaveAttribute("data-compact", "true");
  });
});
