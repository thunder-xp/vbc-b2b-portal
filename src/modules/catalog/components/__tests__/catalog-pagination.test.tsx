import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildCatalogPaginationItems, getCatalogTotalPages } from "../../services";
import { CatalogPagination } from "../CatalogPagination";

vi.mock("next/link", () => ({ default: ({ children, href, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
  void prefetch;
  return <a href={href} {...props}>{children}</a>;
} }));

const attributeKey = "property_11111111-1111-1111-1111-111111111111";
const props = {
  availability: "expected" as const,
  attributeFilters: { [attributeKey]: ["4 MP", "8 MP"] },
  categoryId: "category-1",
  explicitAll: true,
  page: 6,
  pageSize: 20,
  search: "camera",
  sort: "price_desc" as const,
  totalCount: 400,
};

describe("catalog numbered pagination", () => {
  it("calculates indexed pages and a bounded window with real gaps", () => {
    expect(getCatalogTotalPages(400, 20)).toBe(20);
    expect(getCatalogTotalPages(0, 20)).toBe(1);
    expect(buildCatalogPaginationItems(1, 10)).toEqual([1, 2, 3, "ellipsis", 10]);
    expect(buildCatalogPaginationItems(6, 20)).toEqual([1, "ellipsis", 4, 5, 6, 7, 8, "ellipsis", 20]);
    expect(buildCatalogPaginationItems(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("renders centered direct links, ellipses, and the current-page contract", () => {
    render(<CatalogPagination {...props} />);
    const navigation = screen.getByRole("navigation", { name: "Пагинация каталога" });
    expect(navigation).toHaveClass("justify-center", "flex-wrap");
    expect(screen.getByLabelText("Страница 6, текущая")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("…")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Страница 20" })).toHaveAttribute("href", expect.stringContaining("page=20"));
  });

  it("preserves validated catalog URL state on direct, previous, and next links", () => {
    render(<CatalogPagination {...props} />);
    for (const label of ["Предыдущая страница", "Следующая страница", "Страница 20"]) {
      const href = screen.getByRole("link", { name: label }).getAttribute("href");
      const params = new URL(href!, "https://example.test").searchParams;
      expect(params.get("category")).toBe("category-1");
      expect(params.get("search")).toBe("camera");
      expect(params.get("availability")).toBe("expected");
      expect(params.get("sort")).toBe("price_desc");
      expect(params.get(`attr.${attributeKey}`)).toBe("4 MP,8 MP");
      expect(params.get("view")).toBe("all");
    }
  });

  it("announces disabled boundaries on the first and last page", () => {
    const { rerender } = render(<CatalogPagination {...props} page={1} />);
    expect(screen.getByText("Назад")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Следующая страница" })).toHaveAttribute("href", expect.stringContaining("page=2"));

    rerender(<CatalogPagination {...props} page={20} />);
    expect(screen.getByText("Далее")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Предыдущая страница" })).toHaveAttribute("href", expect.stringContaining("page=19"));
  });
});
