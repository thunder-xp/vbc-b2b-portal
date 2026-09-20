import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublicPartnerDirectory: vi.fn() }));

vi.mock("@/src/modules/public-retail/server", () => ({
  getPublicPartnerDirectory: mocks.getPublicPartnerDirectory,
}));
vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import PublicPartnersPage, { generateMetadata } from "../page";

describe("public partners page", () => {
  it("renders only the strict public DTO and preserves localized navigation", async () => {
    mocks.getPublicPartnerDirectory.mockResolvedValue({
      items: [{ slug: "approved-partner", displayName: "Approved Partner", logoUrl: null, locality: "Chișinău", capabilities: [], updatedAt: null }],
      localities: ["Chișinău"],
      capabilityCodes: [],
    });
    const { container } = render(await PublicPartnersPage({ searchParams: Promise.resolve({ lang: "ro" }) }));

    expect(screen.getByRole("heading", { name: "Comunitatea partenerilor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Approved Partner" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Contacte" })[0]).toHaveAttribute("href", "/contacts?lang=ro");
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deschide profilul/ })).toHaveAttribute("href", "/partners/approved-partner?lang=ro");
    expect(container.innerHTML).not.toMatch(/companyId|external_1c|debt|contract|partnerPrice/i);
    expect(mocks.getPublicPartnerDirectory).toHaveBeenCalledOnce();
  });

  it("localizes Romanian metadata", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ lang: "ro" }) });

    expect(metadata.title).toBe("Comunitatea partenerilor | Novotech");
    expect(metadata.description).toBe("Profiluri publice ale companiilor care lucrează cu sisteme profesionale de securitate și soluții Novotech în Moldova.");
  });
});
