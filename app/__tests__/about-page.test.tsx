import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import AboutPage, { generateMetadata } from "../about/page";

describe("public About page", () => {
  it("renders authored Russian company content and governed navigation", async () => {
    render(await AboutPage({ searchParams: Promise.resolve({ lang: "ru" }) }));
    expect(screen.getByRole("heading", { level: 1, name: /системы безопасности и профессиональное оборудование в Молдове/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dahua и другие технологии безопасности" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть каталог" })).toHaveAttribute("href", "/catalog?lang=ru&view=all");
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"AboutPage"');
  });

  it("renders natural Romanian content and localized metadata", async () => {
    render(await AboutPage({ searchParams: Promise.resolve({ lang: "ro" }) }));
    expect(screen.getByRole("heading", { level: 1, name: /sisteme de securitate și echipamente profesionale în Moldova/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dahua și alte tehnologii de securitate" })).toBeInTheDocument();
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ lang: "ro" }) });
    expect(metadata.alternates?.canonical).toBe("https://www.nsd.md/about?lang=ro");
    expect(metadata.alternates?.languages).toMatchObject({ ru: "https://www.nsd.md/about?lang=ru", ro: "https://www.nsd.md/about?lang=ro" });
  });
});
