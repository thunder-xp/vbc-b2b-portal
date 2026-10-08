import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignCountdown } from "../CampaignCountdown";
import { CampaignCommercialSummary } from "../CampaignCommercialSummary";
import { CampaignBundleProgress } from "../CampaignBundleProgress";
import { CampaignBuilder } from "../CampaignBuilder";
import { CampaignBundlePreview } from "../CampaignBundlePreview";
import type { CampaignBundleState, CampaignCommercialSummary as Summary, CampaignDraftInput, CampaignDraftSeed } from "../../types";
const { complete, preview, refresh } = vi.hoisted(() => ({ complete: vi.fn(), preview: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({ completeCampaignBundleAction: complete, previewCampaignBundleAction: preview, createCampaignDraftAction: vi.fn(), updateCampaignDraftAction: vi.fn(), searchCampaignProductsAction: vi.fn().mockResolvedValue({ success: true, data: { items: [], totalCount: 0, totalPages: 1 } }), searchCampaignCompaniesAction: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
const summary: Summary = { normalPartnerTotal: "518.00", specialBundleTotal: "456.70", saving: "61.30", retailTotal: "14600.00", markupFromRetail: "+65%", currency: "USD", skuCount: 2, totalUnits: 5 };
const progress: CampaignBundleState = { campaignId: "campaign", publicationVersion: 3, conditionsReady: true, eligible: false, stockReady: false, reason: "incomplete_bundle",
  components: [{ campaignItemId: "line", productId: "product", sku: "SKU", name: "Test product", requiredBundleQuantity: 4, currentQuantity: 0, missingQuantity: 4, availableQuantity: 1 }] };

describe("Special Offers V2A presentation", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it("shows four countdown units, reaches zero, cleans its timer and never announces every second", () => {
    vi.useFakeTimers(); let elapsed = 0; vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container, unmount } = render(<CampaignCountdown remainingSeconds={2} />);
    expect(screen.getByText("секунд")).toBeInTheDocument(); expect(container.querySelector('[aria-live]')).toBeNull();
    act(() => { elapsed = 2000; vi.advanceTimersByTime(2000); });
    expect(screen.getByText("Предложение завершено")).toBeInTheDocument(); expect(fetchSpy).not.toHaveBeenCalled();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("renders the compact RU/RO time signal from supplied server seconds", () => {
    const { rerender } = render(<CampaignCountdown compact remainingSeconds={5 * 86400 + 17 * 3600} />);
    expect(screen.getByText("До конца: 5 дн. 17 ч.")).toBeInTheDocument();
    rerender(<CampaignCountdown compact locale="ro" remainingSeconds={5 * 86400 + 17 * 3600} />);
    expect(screen.getByText("Mai sunt: 5 z. 17 h.")).toBeInTheDocument();
  });
  it("strikes normal partner total only and displays supplied special/saving/retail/markup", () => {
    const { container } = render(<CampaignCommercialSummary summary={summary} locale="ru" />);
    expect(screen.getByText("Обычная цена партнёра").nextElementSibling).toHaveClass("line-through");
    expect(screen.getByText("Спеццена").nextElementSibling).not.toHaveClass("line-through");
    expect(screen.getByText("Розница").nextElementSibling).not.toHaveClass("line-through");
    expect(screen.getByText("Экономия")).toBeInTheDocument(); expect(screen.getByText("+65%")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("tabular-nums");
  });
  it("admits a shortage bundle via the same bulk action with no client price or company payload", async () => {
    complete.mockResolvedValue({ success: true, message: "Набор добавлен" });
    render(<CampaignBundleProgress progress={progress} mechanicType="bundle_special_price" locale="ru" />);
    const button = screen.getByRole("button", { name: "Добавить набор в корзину" }); expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(complete).toHaveBeenCalledExactlyOnceWith({ campaignId: "campaign", publicationVersion: 3, requestId: expect.any(String) });
    expect(screen.queryByText(/PROMO/)).toBeNull();
  });
  it("retains old fixed-bundle stock behavior", () => {
    render(<CampaignBundleProgress progress={progress} mechanicType="fixed_bundle_promo" locale="ru" />);
    expect(screen.getByRole("button", { name: "Добавить комплект" })).toBeDisabled();
  });
  it("requests an authorized Admin preview explicitly and hides stale financial values after edits", async () => {
    const input = { companyIds: ["company"], audienceMode: "explicit_company", items: [] } as unknown as CampaignDraftInput;
    preview.mockResolvedValue({ success: true, data: summary, message: "Ready" });
    const { rerender } = render(<CampaignBundlePreview input={input} companies={[{ id: "company", name: "Test company", status: "active" }]} />);
    expect(preview).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Рассчитать предпросмотр" }));
    await waitFor(() => expect(screen.getByText("Экономия")).toBeInTheDocument()); expect(preview).toHaveBeenCalledExactlyOnceWith(input, "company");
    await act(async () => { rerender(<CampaignBundlePreview input={{ ...input, partnerTitle: "Edited" }} companies={[{ id: "company", name: "Test company", status: "active" }]} />); });
    expect(screen.queryByText("Экономия")).toBeNull(); expect(preview).toHaveBeenCalledOnce();
  });

  it("extends the existing Admin editor with quantities, special unit prices and currency, rejecting zero prices", () => {
    const product = { id: "product", sku: "SKU", model: "Test model", name: "Test product", imageUrl: null, categoryId: null, categoryName: null, brandId: null, brandName: null,
      availableQuantity: null, currentPrice: { amount: 92, currency: "USD" }, promoPrice: null };
    const initial: CampaignDraftSeed = { campaignId: "campaign", revision: 0, values: { code: "TEST_BUNDLE", name: "Test bundle", title: "Test bundle",
      description: "Test-only bundle", terms: "Test terms", internalNote: "", type: "product_offer", startsAt: "2026-10-08T10:00", endsAt: "2026-10-09T10:00", priority: 1, image: "", mechanicType: "bundle_special_price" },
      audienceMode: "explicit_company", companyIds: ["company"], items: [{ productId: "product", sortOrder: 1, minimumQuantity: 1, maximumQuantityPerCompany: null, benefitType: "informational_only",
        governedBenefitReference: null, partnerMessage: null, promoThresholdQuantity: null, requiredBundleQuantity: 4, bundleSpecialUnitPrice: "80.15", bundleSpecialCurrency: "USD", product }] };
    render(<CampaignBuilder initial={initial} options={{ products: [product], productTotalCount: 1, companies: [], categories: [], brands: [], priceProfiles: [], assets: [] }} />);
    expect(screen.getByRole("option", { name: "Набор по спеццене" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2. Товары" }));
    expect(screen.getByRole("spinbutton", { name: "Количество в комплекте SKU" })).toHaveValue(4);
    expect(screen.getByRole("textbox", { name: "Спеццена SKU" })).toHaveValue("80.15");
    expect(screen.getByRole("combobox", { name: "Валюта SKU" })).toHaveValue("USD");
    fireEvent.change(screen.getByRole("textbox", { name: "Спеццена SKU" }), { target: { value: "0" } });
    const next = screen.getAllByRole("button", { name: "Далее" }); fireEvent.click(next[next.length - 1]);
    expect(screen.getByText("Проверьте количество, спеццену и валюту каждой строки набора.")).toBeInTheDocument();
  });
});
