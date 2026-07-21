import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseCatalogViewMode } from "../../services/catalog-view-preference";
import { CatalogViewSwitcher } from "../CatalogViewSwitcher";

describe("catalog view preference", () => {
  it("defaults invalid values to cards", () => {
    expect(parseCatalogViewMode(undefined)).toBe("cards");
    expect(parseCatalogViewMode("grid")).toBe("cards");
    expect(parseCatalogViewMode("list")).toBe("list");
  });

  it("exposes the active mode and persists a list selection", () => {
    let selected = "cards";
    const { rerender } = render(<CatalogViewSwitcher mode="cards" onChange={(mode) => { selected = mode; }} />);
    expect(screen.getByRole("button", { name: "Карточки" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Список" }));
    expect(selected).toBe("list");
    expect(document.cookie).toContain("novotech-catalog-view-v1=list");
    rerender(<CatalogViewSwitcher mode="list" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Список" })).toHaveAttribute("aria-pressed", "true");
  });
});
