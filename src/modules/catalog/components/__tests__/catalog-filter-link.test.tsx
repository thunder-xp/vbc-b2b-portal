import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    className,
    href,
    prefetch,
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a className={className} data-prefetch={String(prefetch)} href={href}>
      {children}
    </a>
  ),
}));

import { CatalogFilterLink } from "../CatalogFilterLink";

describe("CatalogFilterLink", () => {
  it("renders one accessible standard navigation target", () => {
    render(
      <CatalogFilterLink className="filter-link" href="/cabinet/catalog?availability=in_stock">
        В наличии
      </CatalogFilterLink>,
    );

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "В наличии" })).toHaveAttribute(
      "href",
      "/cabinet/catalog?availability=in_stock",
    );
    expect(screen.getByRole("link", { name: "В наличии" })).toHaveClass("filter-link");
    expect(screen.getByRole("link", { name: "В наличии" })).toHaveAttribute(
      "data-prefetch",
      "false",
    );
  });
});
