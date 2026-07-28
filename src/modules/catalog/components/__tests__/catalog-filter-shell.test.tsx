import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CatalogFilterShell } from "../CatalogFilterShell";

describe("CatalogFilterShell", () => {
  it("shows the active count and closes on Escape", () => {
    render(<CatalogFilterShell selectedCount={2}><a href="/catalog">Filter</a></CatalogFilterShell>);
    const trigger = screen.getByRole("button", { name: "Фильтры (2)" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Фильтры каталога" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes from the backdrop without duplicating filter content", () => {
    render(<CatalogFilterShell selectedCount={0}><a href="/catalog">Filter</a></CatalogFilterShell>);
    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));
    expect(screen.getAllByText("Filter")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Закрыть фильтры" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
