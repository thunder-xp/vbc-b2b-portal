import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ offers: vi.fn(), opportunities: vi.fn(), context: vi.fn(), locale: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/src/modules/partner-locale/server", () => ({ getPartnerLocale: mocks.locale }));
vi.mock("@/src/modules/commercial-campaigns/actions", () => ({ listPartnerCampaignsAction: mocks.offers }));
vi.mock("@/src/modules/commercial-campaigns/components", () => ({ CampaignCard: () => <article>Offer</article> }));
vi.mock("@/src/modules/commercial-opportunities/actions", () => ({ listCommercialOpportunitiesAction: mocks.opportunities }));
vi.mock("@/src/modules/commercial-opportunities/components", () => ({ OpportunityCard: () => <article>Opportunity</article> }));
vi.mock("@/src/modules/partner-cabinet/actions", () => ({ getPartnerWorkspaceContextAction: mocks.context }));
vi.mock("@/src/modules/behavior-analytics/components", () => ({ BehaviorViewEvent: () => null }));
import OffersPage from "../offers/page";
import OpportunitiesPage from "../opportunities/page";

describe("compact partner working pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.locale.mockResolvedValue("ru");
    mocks.offers.mockResolvedValue({ success: true, data: { items: [], totalPages: 1 } });
    mocks.opportunities.mockResolvedValue({ success: true, data: { items: [], totalCount: 0, page: 1, totalPages: 1 } });
    mocks.context.mockResolvedValue({ success: false });
  });
  it.each(["ru", "ro"])("keeps the %s offers empty state compact and removes redundant pagination/copy", async (locale) => {
    mocks.locale.mockResolvedValue(locale);
    const { container } = render(await OffersPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[data-compact-empty]')).toHaveClass("py-4");
    expect(container.querySelector('[data-compact-empty] p')).toBeNull();
    expect(container.textContent).not.toMatch(/Цены и наличие проверяются|Страница 1|Pagina 1/);
    expect(container.querySelector('header')).not.toHaveClass("border-b");
    expect(mocks.offers).toHaveBeenCalledExactlyOnceWith({ filter: "active", page: 1, pageSize: 20 });
  });
  it("preserves actual multi-page offers navigation and touch targets", async () => {
    mocks.offers.mockResolvedValue({ success: true, data: { items: [], totalPages: 3 } });
    render(await OffersPage({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(screen.getByRole("link", { name: "Назад" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Далее" })).toHaveAttribute("href", "/cabinet/offers?filter=active&page=3");
  });
  it.each(["ru", "ro"])("keeps %s Opportunities filters, one title and unchanged request work", async (locale) => {
    mocks.locale.mockResolvedValue(locale);
    const { container } = render(await OpportunitiesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(container.querySelector('header p')).toBeNull();
    expect(container.textContent).not.toMatch(/Объяснимые сигналы|Semnale explicabile/);
    expect(container.querySelectorAll('nav a.min-h-11')).toHaveLength(6);
    expect(mocks.opportunities).toHaveBeenCalledExactlyOnceWith({ filter: "all", page: 1 });
    expect(mocks.context).toHaveBeenCalledOnce();
  });
});
