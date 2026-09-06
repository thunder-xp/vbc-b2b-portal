import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchasingListsPage from "../page";

const listAction = vi.hoisted(() => vi.fn());
vi.mock("@/src/modules/purchasing-lists/actions", () => ({ listPurchasingListsAction: listAction }));
vi.mock("@/src/modules/partner-locale/server", () => ({ getPartnerLocale: async () => "ru" }));

describe("Favorites heading presentation", () => {
  beforeEach(() => listAction.mockResolvedValue({ success: true, data: { records: [], page: 1, totalPages: 1 } }));

  it("removes only the Favorites heading border while retaining spacing and empty state", async () => {
    const { container } = render(await PurchasingListsPage({ searchParams: Promise.resolve({ filter: "favorites" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Избранное" })).toBeInTheDocument();
    expect(container.querySelector("header")).toHaveClass("pb-5");
    expect(container.querySelector("header")).not.toHaveClass("border-b");
    expect(container.querySelector(".border-dashed")).toHaveClass("rounded-lg", "px-4", "py-8");
    expect(container.querySelector("hr")).toBeNull();
    expect(listAction).toHaveBeenCalledExactlyOnceWith({ search: undefined, filter: "all", page: 1 });
  });

  it("retains the My Kits heading border and content card structure", async () => {
    listAction.mockResolvedValue({ success: true, data: { records: [{ id: "kit-1", name: "Test kit", isSystemFavorites: false, itemCount: 2, totalQuantity: 3, updatedAt: "2026-09-06" }], page: 1, totalPages: 1 } });
    const { container } = render(await PurchasingListsPage({ searchParams: Promise.resolve({}) }));
    expect(container.querySelector("header")).toHaveClass("border-b", "pb-5");
    expect(screen.getByRole("heading", { name: "Test kit" })).toBeInTheDocument();
  });
});
