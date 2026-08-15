import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listPartners: vi.fn() }));

vi.mock("@/src/modules/public-retail/server", () => ({
  getPublicPartnerDirectoryService: () => ({ listPartners: mocks.listPartners }),
}));
vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import PublicPartnersPage, { generateMetadata } from "../page";

describe("public partners page", () => {
  it("renders only the strict public DTO and preserves localized navigation", async () => {
    mocks.listPartners.mockResolvedValue([{ displayName: "Approved Partner", logoUrl: null }]);
    const { container } = render(await PublicPartnersPage({ searchParams: Promise.resolve({ lang: "ro" }) }));

    expect(screen.getByRole("heading", { name: "Partenerii noștri" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Approved Partner" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Contacte" })[0]).toHaveAttribute("href", "/contacts?lang=ro");
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/companyId|external_1c|debt|contract|partnerPrice/i);
    expect(mocks.listPartners).toHaveBeenCalledOnce();
  });

  it("localizes Romanian metadata", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ lang: "ro" }) });

    expect(metadata.title).toBe("Partenerii noștri | Novotech");
    expect(metadata.description).toBe("Rețeaua oficială de parteneri Novotech Systems.");
  });
});
