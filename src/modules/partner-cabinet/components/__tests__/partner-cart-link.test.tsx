import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { PartnerCartLink } from "../PartnerCartLink";

describe("PartnerCartLink", () => {
  it("uses authoritative total-unit events for add, quantity change, removal, and empty cart", () => {
    render(<PartnerCartLink cartLabel="Корзина" initialCount={3} positionsLabel="позиций" />);
    act(() => window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { totalUnitCount: 5 } })));
    expect(screen.getByRole("link", { name: "Корзина: 5 позиций" })).toHaveAttribute("href", "/cabinet/cart");
    act(() => window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { totalUnitCount: 2 } })));
    expect(screen.getByRole("link", { name: "Корзина: 2 позиций" })).toBeInTheDocument();
    act(() => window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { totalUnitCount: 0 } })));
    const empty = screen.getByRole("link", { name: "Корзина: 0 позиций" });
    expect(empty.querySelector("span")).toBeNull();
  });

  it("ignores non-authoritative events and synchronizes refreshed server props", () => {
    const view = render(<PartnerCartLink cartLabel="Корзина" initialCount={3} positionsLabel="позиций" />);
    act(() => window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { quantityAdded: 9 } })));
    expect(screen.getByRole("link", { name: "Корзина: 3 позиций" })).toBeInTheDocument();
    view.rerender(<PartnerCartLink cartLabel="Корзина" initialCount={1} positionsLabel="позиций" />);
    expect(screen.getByRole("link", { name: "Корзина: 1 позиций" })).toBeInTheDocument();
  });
});
