import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSubmitForm } from "../OrderSubmitForm";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../actions", () => ({ submitCartOrderAction: mocks.submit }));

describe("OrderSubmitForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves the selected delivery date after a Server Action error", async () => {
    mocks.submit.mockResolvedValue({ success: false, errorCode: "ORDER_RECOVERABLE", message: "Заказ не был отправлен. Корзина сохранена — проверьте данные и повторите попытку.", data: null });
    const user = userEvent.setup();
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    const date = screen.getByLabelText("Желаемая дата отгрузки");
    await user.type(date, "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Подтвердить заказ" }));
    expect(await screen.findByText(/Корзина сохранена/)).toBeInTheDocument();
    expect(date).toHaveValue("2099-01-10");
  });

  it("preserves the date when the parent refreshes after a quantity update", async () => {
    const user = userEvent.setup();
    const view = render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    const date = screen.getByLabelText("Желаемая дата отгрузки");
    await user.type(date, "2099-01-10");
    view.rerender(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(date).toHaveValue("2099-01-10");
  });

  it("blocks another submission while reconciliation is required", async () => {
    mocks.submit.mockResolvedValue({ success: false, errorCode: "ORDER_RECONCILIATION_REQUIRED", message: "Статус отправки заказа уточняется. Не отправляйте заказ повторно.", data: null });
    const user = userEvent.setup();
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.type(screen.getByLabelText("Желаемая дата отгрузки"), "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Подтвердить заказ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Подтвердить заказ" })).toBeDisabled());
  });
});
