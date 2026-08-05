import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PartnerSidebar } from "../PartnerSidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/cabinet/loyalty/affiliate" }));
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ children, href, prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
  void prefetch;
  return <a href={href} {...props}>{children}</a>;
} }));

describe("partner loyalty navigation", () => {
  it("renders governed child routes and opens the active parent", async () => {
    render(<PartnerSidebar navigation={[
      { key: "loyalty_affiliate", label: "Аффилированная программа", href: "/cabinet/loyalty/affiliate", icon: "loyalty_affiliate", availability: "available" },
      { key: "loyalty_bonus", label: "Бонусная программа", href: "/cabinet/loyalty/bonus", icon: "loyalty_bonus", availability: "available" },
    ]} />);

    const parent = screen.getByRole("button", { name: /Программы лояльности/ });
    expect(parent).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Аффилированная программа" })).toHaveAttribute("href", "/cabinet/loyalty/affiliate");
    expect(screen.getByRole("link", { name: "Бонусная программа" })).toHaveAttribute("href", "/cabinet/loyalty/bonus");
    await userEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
  });

  it("does not render an empty loyalty group", () => {
    render(<PartnerSidebar navigation={[]} />);
    expect(screen.queryByRole("button", { name: /Программы лояльности/ })).not.toBeInTheDocument();
  });
});
