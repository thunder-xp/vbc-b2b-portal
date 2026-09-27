import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getOrdersCopy } from "@/src/modules/partner-locale";
import { CartPricingPanel, CartLineValue } from "../CartPricingPanel";
import { CartCheckoutCoordinator } from "../CartCheckoutCoordinator";

vi.mock("../OrderSubmitForm", () => ({ OrderSubmitForm: ({ commercialRateId }: { commercialRateId?: string | null }) => <form aria-label="checkout details"><input name="expectedCommercialRateId" type="hidden" value={commercialRateId ?? ""} /></form> }));
vi.mock("@/src/modules/estimates/components/CreateEstimateFromCartButton", () => ({ CreateEstimateFromCartButton: () => <button>Create estimate</button> }));
vi.mock("@/src/modules/purchasing-lists/components", () => ({ SaveAsPurchasingListButton: () => <button>Save set</button> }));

const props = {
  positionCount: 2,
  totalUnitCount: 3,
  total999: "1 000 MDL",
  total113: "900 MDL",
  savings: "100 MDL",
  checkoutOptions: { counterpartyKind: "legal_entity" as const, paymentMethods: [
    { value: "cashless" as const, enabled: true, contractLabel: null, unavailableReason: null },
    { value: "cash" as const, enabled: true, contractLabel: null, unavailableReason: null },
  ], carriers: [] },
  onlinePaymentEnabled: true,
  commercialRateId: "66666666-6666-4666-8666-666666666666",
  reconciliationLocked: false,
  submissionKey: "55555555-5555-4555-8555-555555555555",
  cartId: "44444444-4444-4444-8444-444444444444",
  intentVersion: 7,
  locale: "ru" as const,
  copy: getOrdersCopy("ru"),
};

describe("cart online pricing selection", () => {
  it("starts at 999, switches line and total to 113, and hides pay-later and utility actions", () => {
    render(<CartCheckoutCoordinator>
      <CartPricingPanel {...props} />
      <CartLineValue standard="500 MDL" online="450 MDL" />
    </CartCheckoutCoordinator>);

    expect(screen.getByText("1 000 MDL")).toBeInTheDocument();
    expect(screen.getByText("1 000 MDL")).toHaveClass("text-rose-700");
    expect(screen.getByText("500 MDL")).toBeInTheDocument();
    expect(screen.getByText(/100 MDL/)).toBeInTheDocument();
    expect(screen.queryByText(/BCRU|BCR 999|rate 113/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Безналичный/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create estimate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ОПЛАТИТЬ СЕЙЧАС/ }));

    expect(screen.getByText("900 MDL")).toBeInTheDocument();
    expect(screen.getByText("900 MDL")).toHaveClass("text-rose-700");
    expect(screen.getByText("450 MDL")).toBeInTheDocument();
    expect(screen.queryByText(/BCRU|BCR 999|rate 113/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Безналичный/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create estimate" })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "checkout details" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "checkout details" }).querySelector<HTMLInputElement>("[name=expectedCommercialRateId]")?.value).toBe(props.commercialRateId);
  });

  it("keeps pay-later choices in one two-column group", () => {
    render(<CartCheckoutCoordinator><CartPricingPanel {...props} /></CartCheckoutCoordinator>);
    const group = screen.getByRole("region", { name: "Оплатить позже" });
    expect(group.querySelector("div.grid.grid-cols-2")).not.toBeNull();
  });
});
