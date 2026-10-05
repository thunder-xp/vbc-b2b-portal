import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CartCampaignIndicator } from "../CartCampaignIndicator";
import type { CartCampaignContext } from "../../../pricing-inventory/types/effective-price";

const context: CartCampaignContext = { campaignId: "campaign", campaignItemId: "item", publicationVersion: 1,
  mechanicType: "quantity_threshold_promo", eligible: false, reason: "quantity_below_threshold", thresholdQuantity: 3,
  requestedQuantity: 1, progress: null };
describe("cart commercial intent presentation", () => {
  it("renders no campaign badge for ordinary commerce", () => {
    const { container } = render(<CartCampaignIndicator context={null} locale="ru" />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows campaign intent and server progress until the condition is met", () => {
    const { rerender } = render(<CartCampaignIndicator context={context} locale="ru" />);
    expect(screen.getByText("Спецпредложение")).toBeInTheDocument();
    expect(screen.getByText(/Условия предложения ещё не выполнены/)).toHaveTextContent("+2 шт.");
    rerender(<CartCampaignIndicator context={{ ...context, eligible: true, requestedQuantity: 3 }} locale="ru" />);
    expect(screen.queryByText(/Условия предложения ещё не выполнены/)).not.toBeInTheDocument();
  });
  it("retains the subtle localized badge for normal-price qualifying components", () => {
    render(<CartCampaignIndicator context={{ ...context, mechanicType: "spend_threshold_promo", thresholdQuantity: null,
      reason: "qualifying_normal_price", progress: { remainingSpendUsd: "0.00" } }} locale="ro" />);
    expect(screen.getByText("Ofertă specială")).toBeInTheDocument();
    expect(screen.queryByText(/Condițiile/)).not.toBeInTheDocument();
  });
});
