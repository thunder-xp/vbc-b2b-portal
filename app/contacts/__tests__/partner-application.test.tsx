import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import ContactsPage from "../page";

describe("Commercial Agent public intake", () => {
  it("hands the Agent intent to the existing governed manual intake without creating Partner membership", async () => {
    render(await ContactsPage({ searchParams: Promise.resolve({ lang: "ru", request: "commercial-agent" }) }));

    expect(screen.getByRole("heading", { name: "Заявка коммерческого агента" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "info@nsd.md" }).some((link) => link.getAttribute("href")?.includes("subject="))).toBe(true);
    expect(screen.getByText(/Партнёрская компания автоматически не создаётся/)).toBeInTheDocument();
  });

  it("does not add the Agent intake panel to the normal Contacts page", async () => {
    render(await ContactsPage({ searchParams: Promise.resolve({ lang: "ro" }) }));
    expect(screen.queryByRole("heading", { name: "Cerere pentru agent comercial" })).not.toBeInTheDocument();
  });
});
