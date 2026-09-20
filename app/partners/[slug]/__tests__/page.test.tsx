import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublicPartnerProfile: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

vi.mock("@/src/modules/public-retail/server", () => ({ getPublicPartnerProfile: mocks.getPublicPartnerProfile }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => "/partners/public-partner",
  useSearchParams: () => new URLSearchParams("lang=ro"),
}));
vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({ PublicRetailCartBadge: () => <a href="/cart">Cart</a> }));

import PublicPartnerProfilePage, { generateMetadata } from "../page";

const profile = {
  slug: "public-partner",
  displayName: "Public Partner",
  logoUrl: null,
  locality: "Chișinău",
  capabilities: [
    { code: "CCTV" as const, evidenceStatus: "VERIFIED" as const },
    { code: "NETWORK" as const, evidenceStatus: "SELF_DECLARED" as const },
  ],
  updatedAt: "2026-09-20T10:00:00Z",
  descriptionRu: "Публичное описание.",
  descriptionRo: "Descriere publică.",
  publicEmail: "public@example.md",
  publicPhone: "+37322000000",
  publicWebsite: "https://example.md",
};

describe("public Partner profile", () => {
  it("renders only governed localized fields and precise capability evidence", async () => {
    mocks.getPublicPartnerProfile.mockResolvedValue(profile);
    const { container } = render(await PublicPartnerProfilePage({ params: Promise.resolve({ slug: profile.slug }), searchParams: Promise.resolve({ lang: "ro" }) }));
    expect(screen.getByRole("heading", { name: "Public Partner" })).toBeInTheDocument();
    expect(screen.getByText("Descriere publică.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "public@example.md" })).toHaveAttribute("href", "mailto:public@example.md");
    expect(screen.getByLabelText("Competență confirmată de Novotech")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/providerId|ranking|review|availability|assignment|companyId/i);
  });

  it("returns 404 when the published-only slug lookup yields no profile", async () => {
    mocks.getPublicPartnerProfile.mockResolvedValue(null);
    await expect(PublicPartnerProfilePage({ params: Promise.resolve({ slug: "hidden" }), searchParams: Promise.resolve({ lang: "ru" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("builds localized metadata only from public fields", async () => {
    mocks.getPublicPartnerProfile.mockResolvedValue(profile);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: profile.slug }), searchParams: Promise.resolve({ lang: "ru" }) });
    expect(metadata.title).toBe("Public Partner | Novotech");
    expect(metadata.description).toBe("Публичное описание.");
    expect(String(metadata.alternates?.canonical)).toContain("/partners/public-partner?lang=ru");
  });
});
