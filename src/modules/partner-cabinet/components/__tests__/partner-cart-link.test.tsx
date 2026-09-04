import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { PartnerCartLink } from "../PartnerCartLink";

describe("PartnerCartLink", () => {
  it("updates from canonical cart events without another cart request", () => {
    render(<PartnerCartLink cartLabel="Корзина" initialCount={2} positionsLabel="позиций" />);
    act(() => window.dispatchEvent(new CustomEvent("novotech:cart-updated", { detail: { quantityAdded: 3 } })));
    expect(screen.getByRole("link", { name: "Корзина: 5 позиций" })).toHaveAttribute("href", "/cabinet/cart");
  });
});
