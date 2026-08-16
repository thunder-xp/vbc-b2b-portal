import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import ContactsPage from "../contacts/page";
import { publicCompanyContent } from "@/src/modules/public-retail/public-company-content";

describe("public contacts page", () => {
  it("renders the governed public addresses, hours and contact channels", async () => {
    render(await ContactsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Горячая линия" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1, name: "Контакты и магазины" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ул. Лев Толстой, 4" })).toHaveAttribute("href", expect.stringContaining("google.com/maps/search"));
    expect(screen.getByRole("link", { name: "ул. Лев Толстой, 4" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "ул. Думитру Карачобану, 118" })).toHaveAttribute("href", expect.stringContaining("google.com/maps/search"));
    expect(screen.getAllByRole("link", { name: "0 78 999 484" })[0]).toHaveAttribute("href", "tel:+37378999484");
    expect(screen.getByRole("link", { name: "0 78 999 495" })).toHaveAttribute("href", "tel:+37378999495");
    expect(screen.getAllByText((_, element) => element?.tagName === "SPAN" && element.textContent?.includes("Пн–Пт: 09:00–18:00") === true)).toHaveLength(2);
    expect(screen.getAllByText((_, element) => element?.tagName === "SPAN" && element.textContent?.includes("Сб: 10:00–14:00") === true)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "info@nsd.md" }).length).toBeGreaterThan(0);
    expect(publicCompanyContent.stores.map((store) => store.phone.href)).toEqual(["tel:+37378999484", "tel:+37378999495"]);
  });
});
