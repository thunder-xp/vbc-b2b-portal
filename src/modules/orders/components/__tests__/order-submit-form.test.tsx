import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chisinauBusinessDate,
  formatRussianBusinessDate,
  OrderSubmitForm,
} from "../OrderSubmitForm";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  submit: vi.fn(),
}));
const governedCashlessOptions = {
  counterpartyKind: "legal_entity" as const,
  paymentMethods: [
    { value: "cashless" as const, enabled: true, contractLabel: "NS-67/2104/22", unavailableReason: null },
    { value: "cash" as const, enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" as const },
  ],
  carriers: [],
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("../../actions/order.actions", () => ({ submitCartOrderAction: mocks.submit }));

describe("OrderSubmitForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves the selected delivery date after a Server Action error", async () => {
    mocks.submit.mockResolvedValue({ success: false, errorCode: "ORDER_CONTRACT_MAPPING_MISSING", message: "Не удалось определить договор компании. Обратитесь к менеджеру Novotech.", data: null });
    const user = userEvent.setup();
    const view = render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    const date = screen.getByLabelText("Дата резервации");
    await user.type(date, "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));
    expect(await screen.findByText(/договор компании/)).toBeInTheDocument();
    expect(date).toHaveValue("2099-01-10");
    await waitFor(() => expect(
      view.container.querySelector<HTMLInputElement>('input[name="submissionKey"]')?.value,
    ).not.toBe("55555555-5555-4555-8555-555555555555"));
  });

  it("preserves the date when the parent refreshes after a quantity update", async () => {
    const user = userEvent.setup();
    const view = render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    const date = screen.getByLabelText("Дата резервации");
    await user.type(date, "2099-01-10");
    view.rerender(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(date).toHaveValue("2099-01-10");
  });

  it("blocks another submission while reconciliation is required", async () => {
    mocks.submit.mockResolvedValue({ success: false, errorCode: "ORDER_RECONCILIATION_REQUIRED", message: "Статус отправки заказа уточняется. Не отправляйте заказ повторно.", data: null });
    const user = userEvent.setup();
    render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled());
  });

  it("redirects a confirmed result to the immutable order detail without resubmitting", async () => {
    mocks.submit.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Заказ создан.",
      data: { id: "order-1", redirectTo: "/cabinet/orders/order-1?submitted=1" },
    });
    const user = userEvent.setup();
    const view = render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);

    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/cabinet/orders/order-1?submitted=1"));
    expect(mocks.submit).toHaveBeenCalledOnce();
    view.rerender(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(mocks.replace).toHaveBeenCalledOnce();
  });

  it("keeps the confirmed redirect when cart revalidation unmounts the form", async () => {
    let resolveSubmission: ((value: unknown) => void) | undefined;
    mocks.submit.mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve; }));
    const user = userEvent.setup();
    const view = render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));

    view.rerender(<div>Корзина пуста</div>);
    resolveSubmission?.({
      success: true,
      errorCode: null,
      message: "Заказ создан.",
      data: { id: "order-1", redirectTo: "/cabinet/orders/order-1?submitted=1" },
    });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/cabinet/orders/order-1?submitted=1"));
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("disables submission during the action to guard rapid repeated interaction", async () => {
    let resolveSubmission: ((value: unknown) => void) | undefined;
    mocks.submit.mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve; }));
    const user = userEvent.setup();
    render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);
    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");

    const button = screen.getByRole("button", { name: "Отправить заказ" });
    await user.click(button);
    expect(screen.getByRole("button", { name: "Отправляем заказ…" })).toBeDisabled();
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();

    resolveSubmission?.({ success: false, errorCode: "ORDER_IN_PROGRESS", message: "Заказ уже отправляется.", data: null });
    await screen.findByText("Заказ уже отправляется. Подождите завершения операции.");
  });

  it("removes redundant happy-path checkout helper copy", () => {
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(screen.queryByText("До этой даты оборудование резервируется под заказ.")).not.toBeInTheDocument();
    expect(screen.queryByText("Укажите дату оплаты.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Заказ будет передан в 1С Novotech/)).not.toBeInTheDocument();
  });

  it("submits semantic checkout choices without exposing contract or raw 1C references", async () => {
    const user = userEvent.setup();
    const { container } = render(<OrderSubmitForm
      checkoutOptions={{
        counterpartyKind: "legal_entity",
        paymentMethods: [
          { value: "cashless", enabled: true, contractLabel: "NS-67/2104/22", unavailableReason: null },
          { value: "cash", enabled: true, contractLabel: "С ПОКУПАТЕЛЕМ", unavailableReason: null },
        ],
        carriers: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Novotech Systems" }],
      }}
      submissionKey="55555555-5555-4555-8555-555555555555"
    />);
    expect(screen.getByRole("radio", { name: "Безналичный" })).not.toBeChecked();
    expect(screen.queryByText("Договор: NS-67/2104/22")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Безналичный" }));
    expect(container.querySelector('input[name="paymentMethod"][value="cashless"]')).toBeChecked();
    expect(container.innerHTML).not.toContain("Ref_Key");
  });

  it("starts with an empty mandatory payment date and blocks submit", () => {
    render(<OrderSubmitForm submissionKey="55555555-5555-4555-8555-555555555555" />);

    expect(screen.getByLabelText("Дата оплаты", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Дата оплаты", { exact: true })).toBeDisabled();
    expect(screen.getByRole("region", { name: /Шаг 1: Форма оплаты, требует исправления/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled();
  });

  it("keeps submit disabled for a past payment date", async () => {
    const user = userEvent.setup();
    render(<OrderSubmitForm checkoutOptions={governedCashlessOptions} submissionKey="55555555-5555-4555-8555-555555555555" />);

    await user.click(screen.getByRole("radio", { name: /Безналичный/ }));
    await user.type(screen.getByLabelText("Дата оплаты", { exact: true }), "2000-01-01");

    expect(screen.getByRole("region", { name: /Шаг 2: Дата оплаты, требует исправления/ })).toBeInTheDocument();
    expect(screen.getByText("Проверьте дату оплаты и повторите отправку.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled();
  });

  it("requires an explicit governed payment choice and keeps unavailable methods disabled", () => {
    render(<OrderSubmitForm
      checkoutOptions={{
        counterpartyKind: "legal_entity",
        paymentMethods: [
          { value: "cashless", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
          { value: "cash", enabled: true, contractLabel: "CASH-1", unavailableReason: null },
        ],
        carriers: [],
      }}
      submissionKey="55555555-5555-4555-8555-555555555555"
    />);

    expect(screen.getByRole("radio", { name: "Наличный" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Безналичный/ })).toBeDisabled();
  });

  it("selects no payment method when both governed mappings are unavailable", () => {
    const { container } = render(<OrderSubmitForm
      checkoutOptions={{
        counterpartyKind: "legal_entity",
        paymentMethods: [
          { value: "cashless", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
          { value: "cash", enabled: false, contractLabel: null, unavailableReason: "contract_unavailable" },
        ],
        carriers: [],
      }}
      submissionKey="55555555-5555-4555-8555-555555555555"
    />);

    expect([...container.querySelectorAll<HTMLInputElement>('input[name="paymentMethod"]')]
      .every((radio) => !radio.checked)).toBe(true);
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled();
  });

  it("uses the Chisinau business date without a UTC boundary shift", () => {
    expect(chisinauBusinessDate(new Date("2026-07-29T21:30:00.000Z")))
      .toBe("2026-07-30");
    expect(formatRussianBusinessDate("2026-07-30"))
      .toBe("30 июля 2026 г.");
  });
});
