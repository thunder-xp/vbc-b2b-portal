import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CartCheckoutCoordinator,
  useCartCheckoutCoordinator,
} from "../CartCheckoutCoordinator";
import { OrderSubmitForm, chisinauBusinessDate } from "../OrderSubmitForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../actions/order.actions", () => ({
  submitCartOrderAction: vi.fn(),
}));
vi.mock(
  "../../../behavior-analytics/components/BehaviorViewEvent",
  () => ({ recordBehaviorInteraction: vi.fn() }),
);

describe("managed cart payment selection", () => {
  it("passes the primary Pay Now choice into the existing checkout flow without a legacy payment tile", () => {
    const { container } = render(
      <CartCheckoutCoordinator managedPaymentSelection>
        <SelectOnline />
        <OrderSubmitForm
          checkoutOptions={{
            counterpartyKind: "legal_entity",
            paymentMethods: [
              { value: "cashless", enabled: true, contractLabel: "governed", unavailableReason: null },
              { value: "cash", enabled: true, contractLabel: "governed", unavailableReason: null },
            ],
            carriers: [],
          }}
          onlinePaymentEnabled
          submissionKey="55555555-5555-4555-8555-555555555555"
        />
      </CartCheckoutCoordinator>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Pay Now" }));

    expect(container.querySelector('input[name="paymentMethod"][type="hidden"]')).toHaveValue("online");
    expect(screen.getByText("Онлайн-оплата через MAIB")).toBeInTheDocument();
    expect(screen.getByLabelText("Дата оплаты", { exact: true })).toHaveValue(chisinauBusinessDate());
    expect(screen.queryByRole("radio", { name: /Онлайн-оплата/ })).not.toBeInTheDocument();
  });
});

function SelectOnline() {
  const { setPaymentMethod } = useCartCheckoutCoordinator();
  return <button onClick={() => setPaymentMethod("online")} type="button">Select Pay Now</button>;
}
