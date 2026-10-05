import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignBuilder } from "../CampaignBuilder";
import { CampaignSpendProgress } from "../CampaignSpendProgress";
import type { CampaignBuilderOptions, CampaignDraftSeed, CampaignSpendState } from "../../types";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";

const actions = vi.hoisted(() => ({ update: vi.fn(), add: vi.fn(), refresh: vi.fn(), search: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: actions.refresh }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({ updateCampaignDraftAction: actions.update, addCampaignItemToCartAction: actions.add,
  createCampaignDraftAction: vi.fn(), searchCampaignProductsAction: actions.search,
  searchCampaignCompaniesAction: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
const products = ["A", "C"].map((sku) => ({ id: sku, sku, name: `Product ${sku}`, model: null, imageUrl: null,
  categoryId: null, categoryName: null, brandId: null, brandName: null, availableQuantity: 100,
  currentPrice: { amount: 100, currency: "USD" }, promoPrice: sku === "C" ? { amount: 80, currency: "USD" } : null }));
const options: CampaignBuilderOptions = { products, productTotalCount: 2, categories: [], brands: [],
  companies: [{ id: "company", name: "Partner", status: "active" }], priceProfiles: [], assets: [] };
function seed(): CampaignDraftSeed {
  return { campaignId: "draft", revision: 1, audienceMode: "explicit_company", companyIds: ["company"],
    values: { code: "SPEND", name: "Spend draft", title: "Governed offer", description: "A governed commercial offer", terms: "Existing terms",
      internalNote: "", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-10T10:00", priority: 1, image: "", mechanicType: "legacy_promo" },
    items: products.map((product, index) => ({ product, productId: product.id, sortOrder: index, minimumQuantity: 1,
      maximumQuantityPerCompany: null, benefitType: "informational_only", governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null })) };
}
const progress: CampaignSpendState = { campaignId: "campaign", publicationVersion: 1, eligible: false, conditionsReady: true,
  thresholdAmountUsd: "1500.00", qualifyingSpendUsd: "1280.00", remainingSpendUsd: "220.00", thresholdReached: false,
  rewardPresent: false, rewardStockReady: true, reason: "below_threshold",
  qualifyingProducts: [{ campaignItemId: "qualifier", productId: "A", sku: "A", name: "Camera", currentQuantity: 4 }],
  reward: { campaignItemId: "reward", productId: "C", sku: "C", name: "HDD", minimumQuantity: 1, currentQuantity: 0, availableQuantity: 100 } };

describe("spend editor and server progress", () => {
  beforeEach(() => { actions.update.mockReset(); actions.add.mockReset(); actions.refresh.mockReset(); actions.search.mockResolvedValue({ success: true, data: { items: products, totalCount: 2, totalPages: 1 } }); actions.update.mockResolvedValue({ success: true, message: "Saved", data: { revision: 2 } }); actions.add.mockResolvedValue({ success: true }); });
  it("saves a decimal USD threshold and disjoint typed roles; clears config on mechanic switch", async () => {
    const user = userEvent.setup(); render(<CampaignBuilder options={options} initial={seed()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "spend_threshold_promo");
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Порог закупки, USD" }), { target: { value: "1500.00" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Роль C" }), "REWARD");
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(actions.update).toHaveBeenCalledTimes(1));
    expect(actions.update.mock.calls[0][0]).toMatchObject({ mechanicType: "spend_threshold_promo", spendConfig: { thresholdAmountUsd: "1500.00", currency: "USD", qualifyingProductIds: ["A"], rewardProductId: "C" } });
    expect(actions.update.mock.calls[0][0].items[1]).toMatchObject({ benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef });
    await user.click(screen.getByRole("button", { name: "1. Основное" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "legacy_promo");
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(actions.update).toHaveBeenCalledTimes(2));
    expect(actions.update.mock.calls[1][0].spendConfig).toBeNull();
  });
  it("clears a removed reward role so re-adding the product requires explicit reward selection", async () => {
    const user = userEvent.setup(); render(<CampaignBuilder options={options} initial={seed()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "spend_threshold_promo");
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Роль C" }), "REWARD");
    await user.click(within(screen.getAllByTestId("selected-campaign-product")[1]).getByRole("button", { name: "Удалить" }));
    await user.click(screen.getByRole("button", { name: /C · Product C/ }));
    expect(screen.getByRole("combobox", { name: "Роль C" })).toHaveValue("QUALIFYING_SPEND");
  });
  it("shows below/reached/active progress from the server without an extra add request", () => {
    const { rerender } = render(<CampaignSpendProgress locale="ru" progress={progress} />);
    expect(screen.getByTestId("spend-status")).toHaveTextContent("До PROMO осталось 220 USD");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<CampaignSpendProgress locale="ru" progress={{ ...progress, thresholdReached: true, remainingSpendUsd: "0" }} />);
    expect(screen.getByTestId("spend-status")).toHaveTextContent("Порог достигнут · PROMO открыта");
    expect(screen.getByRole("button", { name: "Добавить по PROMO" })).toBeEnabled();
    rerender(<CampaignSpendProgress locale="ru" progress={{ ...progress, thresholdReached: true, eligible: true, rewardPresent: true }} />);
    expect(screen.getByTestId("spend-status")).toHaveTextContent("PROMO активна");
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(actions.add).not.toHaveBeenCalled();
  });
  it("sends only reward item/quantity/request intent and refreshes authoritative progress", async () => {
    render(<CampaignSpendProgress locale="ru" progress={{ ...progress, thresholdReached: true }} />);
    await userEvent.click(screen.getByRole("button", { name: "Добавить по PROMO" }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledTimes(1));
    expect(actions.add.mock.calls[0][0]).toEqual({ campaignItemId: "reward", quantity: 1, requestId: expect.any(String), publicationVersion: 1 });
    expect(actions.refresh).toHaveBeenCalledOnce();
  });
  it("disables unlocked reward CTA when authoritative stock is insufficient", () => {
    render(<CampaignSpendProgress locale="ru" progress={{ ...progress, thresholdReached: true, rewardStockReady: false }} />);
    expect(screen.getByRole("button", { name: "Добавить по PROMO" })).toBeDisabled();
    expect(screen.getByText("Наличие товара с PROMO требует подтверждения.")).toBeInTheDocument();
  });
});
