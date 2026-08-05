import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NumberedPagination } from "../NumberedPagination";
import { buildPaginationItems } from "../pagination";

vi.mock("next/link", () => ({ default: ({ children, href, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
  void prefetch;
  return <a href={href} {...props}>{children}</a>;
} }));

describe("NumberedPagination", () => {
  it("uses a bounded numbered window with ellipses", () => {
    expect(buildPaginationItems(6, 20)).toEqual([1, "ellipsis", 4, 5, 6, 7, 8, "ellipsis", 20]);
  });

  it("announces the current page and disabled boundaries", () => {
    render(<NumberedPagination ariaLabel="Страницы" currentPage={1} hrefForPage={(page) => `/items?filter=active&page=${page}`} totalPages={20} />);
    expect(screen.getByText("Назад")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Страница 1, текущая")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Страница 20" })).toHaveAttribute("href", "/items?filter=active&page=20");
  });
});
