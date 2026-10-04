import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CampaignBuilder } from "../CampaignBuilder";
import { SPECIAL_OFFERS_COPY } from "../../copy";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";

const push = vi.fn();
const searchProducts = vi.fn();
const searchCompanies = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({
  createCampaignDraftAction: vi.fn(), updateCampaignDraftAction: vi.fn(),
  searchCampaignProductsAction: (...args: unknown[]) => searchProducts(...args),
  searchCampaignCompaniesAction: (...args: unknown[]) => searchCompanies(...args),
}));

const camera = { id: "10000000-0000-4000-8000-000000000001", sku: "800147", model: "DH-C4K-P", name: "Camera", imageUrl: null, categoryId: "cat-1", categoryName: "CCTV", brandId: "brand-1", brandName: "Dahua", availableQuantity: 12, currentPrice: { amount: 118.8, currency: "USD" }, promoPrice: { amount: 110, currency: "USD" } };
const options = { products: [camera], productTotalCount: 848, categories: [{ id: "cat-1", parentId: null, name: "CCTV" }], brands: [{ id: "brand-1", name: "Dahua" }], companies: [{ id: "20000000-0000-4000-8000-000000000001", name: "Partner SRL", status: "active" }], priceProfiles: [{ reference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef, code: SPECIAL_OFFERS_PROMO_PROFILE.externalCode, name: SPECIAL_OFFERS_PROMO_PROFILE.name, currency: SPECIAL_OFFERS_PROMO_PROFILE.currency }], assets: [{ path: "/retail/security-installation-hero.webp", label: "Безопасность" }] };

describe("Special Offers workspace", () => {
  beforeEach(() => {
    searchProducts.mockResolvedValue({ success: true, data: { items: [], totalCount: 0, page: 1, totalPages: 1 }, message: "ok" });
    searchCompanies.mockResolvedValue({ success: true, data: { items: [], totalCount: 0 }, message: "ok" });
  });

  it("keeps step navigation gated by field-level validation", async () => {
    render(<CampaignBuilder options={options} />);
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByText("Укажите внутреннее название.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. Основное" })).toHaveAttribute("aria-current", "step");
  });

  it("keeps selected products visible when the bounded search result changes", async () => {
    render(<CampaignBuilder initial={{ campaignId: "30000000-0000-4000-8000-000000000001", revision: 2, values: { code: "TEST", name: "Test offer", title: "Partner offer", description: "A complete partner offer description", internalNote: "", terms: "Terms", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-05T10:00", priority: 10, image: "", mechanicType: "legacy_promo" }, audienceMode: "explicit_company", companyIds: [options.companies[0].id], items: [{ productId: camera.id, sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null, product: camera }] }} options={options} />);
    await userEvent.click(screen.getByRole("button", { name: "2. Товары" }));
    expect(screen.getByText("Выбранные товары")).toBeInTheDocument();
    expect(screen.getAllByText(/800147 · DH-C4K-P/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Выбрано: 1\/50\./)).toBeInTheDocument();
    expect(screen.getByTestId("selected-campaign-product")).toHaveClass("rounded-md");
    expect(screen.getByTestId("selected-campaign-product").querySelector('[data-product-thumbnail="sm"]')).toBeInTheDocument();
  });

  it("refreshes bounded quick-search results and keeps add/remove friction low", async () => {
    const user = userEvent.setup();
    searchProducts.mockResolvedValue({ success: true, data: { items: [camera], totalCount: 1, page: 1, totalPages: 1 }, message: "ok" });
    render(<CampaignBuilder options={{ ...options, products: [] }} />);
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    await user.type(screen.getByRole("searchbox", { name: "Быстрый поиск товара" }), "800147");
    expect(await screen.findByRole("button", { name: /800147.*Добавить/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /800147.*Добавить/ }));
    expect(screen.getByTestId("selected-campaign-product")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(screen.queryByTestId("selected-campaign-product")).not.toBeInTheDocument();
  });

  it("configures a governed per-product Quantity to PROMO threshold", async () => {
    const user = userEvent.setup();
    render(<CampaignBuilder options={options} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "quantity_threshold_promo");
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    await user.click(screen.getByRole("button", { name: /800147.*Добавить/ }));
    const threshold = screen.getByRole("spinbutton", { name: "PROMO от, шт. 800147" });
    await user.type(threshold, "5");
    expect(threshold).toHaveValue(5);
    expect(screen.getAllByText("Количество → PROMO").length).toBeGreaterThan(0);
    expect(screen.getByText("От 5 шт. → PROMO")).toBeInTheDocument();
    expect(screen.getByText("PROMO · USD")).toBeInTheDocument();
  });

  it("keeps a datetime-local input change in the draft preview", async () => {
    render(<CampaignBuilder initial={{ campaignId: "30000000-0000-4000-8000-000000000001", revision: 2, values: { code: "TEST", name: "Test offer", title: "Partner offer", description: "A complete partner offer description", internalNote: "", terms: "Terms", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-05T10:00", priority: 10, image: "", mechanicType: "legacy_promo" }, audienceMode: "explicit_company", companyIds: [options.companies[0].id], items: [{ productId: camera.id, sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null, product: camera }] }} options={options} />);
    fireEvent.input(screen.getByLabelText("Начало"), { target: { value: "2026-10-04T12:30" } });
    await userEvent.click(screen.getByRole("button", { name: "4. Проверка" }));
    expect(screen.getByText(/2026-10-04T12:30 — 2026-10-05T10:00/)).toBeInTheDocument();
  });

  it("provides both required user-facing locale labels", () => {
    expect(SPECIAL_OFFERS_COPY.ru.title).toBe("Специальные предложения");
    expect(SPECIAL_OFFERS_COPY.ro.title).toBe("Oferte speciale");
  });

  it("fixes the governed commercial condition to PROMO and blocks a missing PROMO price", async () => {
    const user = userEvent.setup();
    render(<CampaignBuilder initial={{ campaignId: "30000000-0000-4000-8000-000000000001", revision: 2, values: { code: "TEST", name: "Test offer", title: "Partner offer", description: "A complete partner offer description", internalNote: "", terms: "Terms", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-05T10:00", priority: 10, image: "", mechanicType: "legacy_promo" }, audienceMode: "explicit_company", companyIds: [options.companies[0].id], items: [{ productId: camera.id, sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null, product: { ...camera, promoPrice: null } }] }} options={options} />);
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    await user.selectOptions(screen.getByLabelText("Коммерческое условие"), "existing_price_profile");
    expect(screen.getByText("PROMO · USD")).toBeInTheDocument();
    expect(screen.getByText("Для позиции 800147 отсутствует опубликованная цена PROMO.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Профиль цены" })).not.toBeInTheDocument();
  });
});
