import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import ContactsPage from "../contacts/page";

describe("public contacts page", () => {
  it("renders the governed public addresses, hours and contact channels", async () => {
    render(await ContactsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Контакты и магазины" })).toBeInTheDocument();
    expect(screen.getByText("ул. Лев Толстой, 4")).toBeInTheDocument();
    expect(screen.getByText("ул. Думитру Карачобану, 118")).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.tagName === "SPAN" && element.textContent?.includes("Пн–Пт: 09:00–18:00") === true)).toHaveLength(2);
    expect(screen.getAllByText((_, element) => element?.tagName === "SPAN" && element.textContent?.includes("Сб: 10:00–14:00") === true)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "info@nsd.md" }).length).toBeGreaterThan(0);
  });
});
