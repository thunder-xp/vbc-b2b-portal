import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/public-retail/components/PublicRetailCartBadge", () => ({
  PublicRetailCartBadge: () => <a href="/cart">Cart</a>,
}));

import BecomePartnerPage, { generateMetadata } from "../page";

describe("professional registration intent selector", () => {
  it("keeps Commercial Agent and Professional Installer on separate existing intake paths", async () => {
    render(await BecomePartnerPage({ searchParams: Promise.resolve({ lang: "ru" }) }));

    expect(screen.getByRole("heading", { name: "Как вы хотите сотрудничать с Novotech?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Коммерческий агент/ })).toHaveAttribute(
      "href",
      "/contacts?lang=ru&request=commercial-agent#partner-application",
    );
    expect(screen.getByRole("link", { name: /Профессиональный инсталлятор/ })).toHaveAttribute(
      "href",
      "/auth/register?lang=ru&intent=installer",
    );
    expect(document.querySelector('input[name="partnerType"]')).not.toBeInTheDocument();
  });

  it("preserves Romanian locale and a validated next path", async () => {
    render(await BecomePartnerPage({ searchParams: Promise.resolve({ lang: "ro", next: "/cabinet" }) }));

    expect(screen.getByRole("heading", { name: "Cum doriți să colaborați cu Novotech?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Instalator profesionist/ })).toHaveAttribute(
      "href",
      "/auth/register?lang=ro&intent=installer&next=%2Fcabinet",
    );
  });

  it("publishes localized metadata", async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ lang: "ro" }) });
    expect(metadata.title).toBe("Devino partener | Novotech");
  });
});
