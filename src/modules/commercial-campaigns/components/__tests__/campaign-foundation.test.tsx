import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignBuilder } from "../CampaignBuilder";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "../../promo-profile";
import type { CampaignBuilderOptions, CampaignDraftSeed, CampaignDraftUpdateInput } from "../../types";

const update = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({
  updateCampaignDraftAction: update, createCampaignDraftAction: vi.fn(),
  searchCampaignProductsAction: vi.fn().mockResolvedValue({ success: true, data: { items: [], totalCount: 0, totalPages: 1 } }),
  searchCampaignCompaniesAction: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
}));
const products = ["A", "C"].map((sku) => ({ id: sku, sku, name: `Product ${sku}`, model: null, imageUrl: null,
  categoryId: null, categoryName: null, brandId: null, brandName: null, availableQuantity: 100,
  currentPrice: { amount: 75, currency: "USD" }, promoPrice: { amount: 68, currency: "USD" } }));
const options: CampaignBuilderOptions = { products, productTotalCount: 2, categories: [], brands: [],
  companies: [{ id: "company", name: "Partner", status: "active" }], priceProfiles: [], assets: [] };
function seed(): CampaignDraftSeed {
  return { campaignId: "draft", revision: 1, audienceMode: "explicit_company", companyIds: ["company"],
    values: { code: "FOUNDATION", name: "Foundation draft", title: "Governed offer", description: "A governed commercial offer",
      terms: "Existing terms", internalNote: "", type: "product_offer", startsAt: "2026-10-04T10:00", endsAt: "2026-10-10T10:00",
      priority: 1, image: "", mechanicType: "quantity_threshold_promo" },
    items: products.map((product, index) => ({ product, productId: product.id, sortOrder: index, minimumQuantity: 1,
      maximumQuantityPerCompany: 10, benefitType: "existing_price_profile", governedBenefitReference: SPECIAL_OFFERS_PROMO_PROFILE.externalRef,
      partnerMessage: "Retained message", promoThresholdQuantity: index ? 1 : 4, requiredBundleQuantity: null,
      attachRole: null, requiredTriggerQuantity: null })) };
}

describe("Admin foundation transitions", () => {
  beforeEach(() => { update.mockReset(); update.mockResolvedValue({ success: true, message: "Saved", data: { revision: 2 } }); });
  it("saves quantity → bundle → attach → legacy without hidden inactive fields", async () => {
    const user = userEvent.setup(); render(<CampaignBuilder options={options} initial={seed()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "fixed_bundle_promo");
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    expect(screen.queryByRole("spinbutton", { name: "PROMO от, шт. A" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Количество в комплекте A" })).toHaveValue(null);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество в комплекте A" }), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество в комплекте C" }), { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    let saved = update.mock.calls[0][0] as CampaignDraftUpdateInput;
    expect(saved.mechanicType).toBe("fixed_bundle_promo");
    expect(saved.items.every((item) => item.promoThresholdQuantity === null && item.attachRole === null && item.requiredTriggerQuantity === null)).toBe(true);
    await user.click(screen.getByRole("button", { name: "1. Основное" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "conditional_attach_promo");
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    expect(screen.queryByRole("spinbutton", { name: "Количество в комплекте A" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Количество условия A" })).toHaveValue(null);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Количество условия A" }), { target: { value: "4" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Роль C" }), "REWARD");
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    saved = update.mock.calls[1][0] as CampaignDraftUpdateInput;
    expect(saved.items.map((item) => item.attachRole)).toEqual(["TRIGGER", "REWARD"]);
    expect(saved.items.every((item) => item.promoThresholdQuantity === null && item.requiredBundleQuantity === null)).toBe(true);
    await user.click(screen.getByRole("button", { name: "1. Основное" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Коммерческая механика/ }), "legacy_promo");
    await user.click(screen.getByRole("button", { name: "Сохранить изменения" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    saved = update.mock.calls[2][0] as CampaignDraftUpdateInput;
    expect(saved.items.every((item) => item.promoThresholdQuantity === null && item.requiredBundleQuantity === null
      && item.attachRole === null && item.requiredTriggerQuantity === null)).toBe(true);
    expect(saved.items.map((item) => item.benefitType)).toEqual(["informational_only", "existing_price_profile"]);
    expect(saved.items.every((item) => item.maximumQuantityPerCompany === 10 && item.partnerMessage === "Retained message")).toBe(true);
  });
  it.each(["fixed_bundle_promo", "conditional_attach_promo"] as const)("%s blocks a requirement below minimum in both step validation and Preview", async (mechanic) => {
    const initial = seed(); initial.values.mechanicType = mechanic;
    initial.items = initial.items.map((item, index) => ({ ...item, minimumQuantity: index ? 1 : 3, promoThresholdQuantity: null,
      requiredBundleQuantity: mechanic === "fixed_bundle_promo" ? index ? 1 : 2 : null,
      attachRole: mechanic === "conditional_attach_promo" ? index ? "REWARD" : "TRIGGER" : null,
      requiredTriggerQuantity: mechanic === "conditional_attach_promo" && !index ? 2 : null,
      benefitType: mechanic === "conditional_attach_promo" && !index ? "informational_only" : "existing_price_profile",
      governedBenefitReference: mechanic === "conditional_attach_promo" && !index ? null : SPECIAL_OFFERS_PROMO_PROFILE.externalRef }));
    const user = userEvent.setup(); render(<CampaignBuilder options={options} initial={initial} />);
    await user.click(screen.getByRole("button", { name: "2. Товары" }));
    await user.click(screen.getAllByRole("button", { name: /^Далее$/ }).at(-1)!);
    expect(screen.getByRole("alert")).toHaveTextContent(/Укажите.*SKU A/);
    expect(screen.getByRole("button", { name: "2. Товары" })).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "4. Проверка" }));
    expect(screen.getByText("○ Коммерческие условия")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
