import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PurchasingListsPage from "../page";

const listAction = vi.hoisted(() => vi.fn());
vi.mock("@/src/modules/purchasing-lists/actions", () => ({ listPurchasingListsAction: listAction }));
vi.mock("@/src/modules/partner-locale/server", () => ({ getPartnerLocale: async () => "ru" }));

describe("saved selections presentation", () => {
  beforeEach(() => listAction.mockResolvedValue({ success: true, data: { records: [], page: 1, totalPages: 1 } }));

  it("moves the Favorites page context out of the body and retains the empty state", async () => {
    const { container } = render(await PurchasingListsPage({ searchParams: Promise.resolve({ filter: "favorites" }) }));
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(container.querySelector("[data-page-header]")).toBeNull();
    expect(container.querySelector(".border-dashed")).toHaveClass("rounded-lg", "px-4", "py-8");
    expect(container.querySelector("hr")).toBeNull();
    expect(listAction).toHaveBeenCalledExactlyOnceWith({ search: undefined, filter: "all", page: 1 });
  });

  it("moves the saved-list page context out of the body and retains content cards", async () => {
    listAction.mockResolvedValue({ success: true, data: { records: [{ id: "kit-1", name: "Test kit", isSystemFavorites: false, itemCount: 2, totalQuantity: 3, updatedAt: "2026-09-06" }], page: 1, totalPages: 1 } });
    const { container } = render(await PurchasingListsPage({ searchParams: Promise.resolve({}) }));
    expect(container.querySelector("[data-page-header]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Test kit" })).toBeInTheDocument();
  });

  it("uses the shared star vocabulary for a Favorites card", async () => {
    listAction.mockResolvedValue({ success: true, data: { records: [{ id: "favorites-1", name: "Избранное", isSystemFavorites: true, itemCount: 2, totalQuantity: 3, updatedAt: "2026-09-08" }], page: 1, totalPages: 1 } });
    const { container } = render(await PurchasingListsPage({ searchParams: Promise.resolve({ filter: "favorites" }) }));
    expect(container.querySelector(".lucide-star")).toBeInTheDocument();
  });
});
