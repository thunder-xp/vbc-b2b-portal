import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CatalogError from "../../../../../app/(partner)/cabinet/catalog/error";

describe("CatalogError", () => {
  it("renders a localized retry path without technical details", () => {
    render(<CatalogError error={Object.assign(new Error("private"), { digest: "support-123" })} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Каталог временно недоступен" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Весь каталог" })).toHaveAttribute("href", "/cabinet/catalog?view=all");
    expect(screen.getByText(/support-123/)).toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });
});
