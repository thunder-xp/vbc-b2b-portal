import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignAttachProgress } from "../CampaignAttachProgress";
import { CampaignPriceStack } from "../CampaignPriceStack";
import type { CampaignAttachState } from "../../types";

const { add, refresh } = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions/commercial-campaign.actions", () => ({ addCampaignItemToCartAction: add }));
const progress: CampaignAttachState = { campaignId: "attach", publicationVersion: 1, eligible: false,
  conditionsReady: true, triggersSatisfied: false, rewardPresent: false, triggerStockReady: true, rewardStockReady: true,
  reason: "incomplete_triggers", triggers: [{ campaignItemId: "a", productId: "a", sku: "A", name: "Camera",
    requiredTriggerQuantity: 4, currentQuantity: 2, missingQuantity: 2, availableQuantity: 10 }],
  reward: { campaignItemId: "c", productId: "c", sku: "C", name: "HDD", minimumQuantity: 1, currentQuantity: 0, availableQuantity: 10 } };
describe("conditional attach presentation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders server progress and does not offer a locked reward", () => {
    render(<CampaignAttachProgress progress={progress} locale="ru" />);
    expect(screen.getByText("Не хватает: 2")).toBeInTheDocument();
    expect(screen.getByText("В корзине: 2 / 4")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("distinguishes unlocked from applied and sends only reward/quantity intent", async () => {
    add.mockResolvedValue({ success: true });
    render(<CampaignAttachProgress progress={{ ...progress, triggersSatisfied: true }} locale="ru" />);
    expect(screen.getByText("PROMO открыта")).toBeInTheDocument();
    expect(screen.queryByText("PROMO активна")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить товар по PROMO" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(add).toHaveBeenCalledWith({ campaignItemId: "c", quantity: 1, requestId: expect.any(String) });
  });
  it("retains request identity after transport failure", async () => {
    add.mockResolvedValue({ success: false, message: "Unavailable" });
    render(<CampaignAttachProgress progress={{ ...progress, triggersSatisfied: true }} locale="ru" />);
    const button = screen.getByRole("button"); fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(add.mock.calls[1][0]).toEqual(add.mock.calls[0][0]);
  });
  it("does not offer unavailable stock as immediately purchasable", () => {
    render(<CampaignAttachProgress progress={{ ...progress, triggersSatisfied: true, rewardStockReady: false }} locale="ru" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("shows an applied reward without another reward CTA", () => {
    render(<CampaignAttachProgress progress={{ ...progress, triggersSatisfied: true, rewardPresent: true, eligible: true }} locale="ro" />);
    expect(screen.getByText("PROMO activă")).toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows ordinary trigger price and conditional governed reward price", () => {
    const { rerender } = render(<CampaignPriceStack locale="ru" product={{ mechanicType: "conditional_attach_promo",
      promoThresholdQuantity: null, msrpPrice: null, partnerPrice: { amount: 92, currency: "USD" }, specialPrice: null }} />);
    expect(screen.queryByText("PROMO при выполнении условия")).not.toBeInTheDocument();
    rerender(<CampaignPriceStack locale="ru" product={{ mechanicType: "conditional_attach_promo",
      promoThresholdQuantity: null, msrpPrice: null, partnerPrice: { amount: 75, currency: "USD" }, specialPrice: { amount: 68, currency: "USD" } }} />);
    expect(screen.getByText("PROMO при выполнении условия")).toBeInTheDocument();
  });
});
