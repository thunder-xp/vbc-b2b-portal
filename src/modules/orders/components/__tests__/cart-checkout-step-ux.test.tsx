import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerLocaleProvider } from "../../../partner-locale";
import { OrderSubmitForm } from "../OrderSubmitForm";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("../../actions/order.actions", () => ({
  submitCartOrderAction: mocks.submit,
}));

const options = {
  counterpartyKind: "legal_entity" as const,
  paymentMethods: [
    { value: "cashless" as const, enabled: true, contractLabel: "NS-1", unavailableReason: null },
    { value: "cash" as const, enabled: true, contractLabel: "CASH-1", unavailableReason: null },
  ],
  carriers: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Novotech Systems" }],
};

describe("guided Cart checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submit.mockResolvedValue({
      success: false,
      errorCode: "ORDER_UNKNOWN_FAILURE",
      message: "Order failed.",
      data: null,
    });
  });

  it("progresses through exactly four explicit operations and preserves backend-governed submit", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    expect(step(1)).toHaveAttribute("data-state", "active");
    expect(step(1)).toHaveAttribute("aria-current", "step");
    expect(step(2)).toHaveAttribute("data-state", "inactive");
    expect(step(3)).toHaveAttribute("data-state", "inactive");
    expect(step(4)).toHaveAttribute("data-state", "inactive");
    expect(screen.getByLabelText("Дата оплаты")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Самовывоз" })).toBeDisabled();
    expect(screen.getByLabelText("Дата резервации")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Безналичный" }));
    expect(step(1)).toHaveAttribute("data-state", "complete");
    expect(step(2)).toHaveAttribute("data-state", "active");

    await user.type(screen.getByLabelText("Дата оплаты"), "2099-01-09");
    expect(step(2)).toHaveAttribute("data-state", "complete");
    expect(step(3)).toHaveAttribute("data-state", "active");

    await user.click(screen.getByRole("radio", { name: "Доставка" }));
    expect(screen.getByLabelText("Перевозчик")).toBeInTheDocument();
    expect(step(3)).toHaveAttribute("data-state", "active");
    await user.selectOptions(screen.getByLabelText("Перевозчик"), options.carriers[0].id);
    expect(step(3)).toHaveAttribute("data-state", "complete");
    expect(step(4)).toHaveAttribute("data-state", "active");

    await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
    expect(step(4)).toHaveAttribute("data-state", "complete");
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeEnabled();
    expect(container.querySelectorAll("[data-checkout-step]")).toHaveLength(4);
  });

  it("keeps later valid values when an earlier date is changed", async () => {
    const user = userEvent.setup();
    renderForm();
    await completePickupFlow(user);

    const paymentDate = screen.getByLabelText("Дата оплаты");
    const reservationDate = screen.getByLabelText("Дата резервации");
    await user.clear(paymentDate);
    expect(step(2)).toHaveAttribute("data-state", "active");
    expect(step(3)).toHaveAttribute("data-state", "inactive");
    expect(step(4)).toHaveAttribute("data-state", "inactive");
    expect(screen.getByRole("radio", { name: "Самовывоз" })).toBeChecked();
    expect(reservationDate).toHaveValue("2099-01-10");

    await user.type(paymentDate, "2099-01-09");
    expect(step(3)).toHaveAttribute("data-state", "complete");
    expect(step(4)).toHaveAttribute("data-state", "complete");
    expect(screen.getByRole("button", { name: "Отправить заказ" })).toBeEnabled();
  });

  it("keeps carrier subordinate to delivery and hides it for pickup", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Наличный" }));
    await user.type(screen.getByLabelText("Дата оплаты"), "2099-01-09");
    await user.click(screen.getByRole("radio", { name: "Доставка" }));
    expect(within(step(3)).getByLabelText("Перевозчик")).toBeInTheDocument();
    expect(step(4)).toHaveAttribute("data-state", "inactive");
    await user.selectOptions(screen.getByLabelText("Перевозчик"), options.carriers[0].id);
    expect(step(4)).toHaveAttribute("data-state", "active");

    await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
    expect(screen.queryByLabelText("Перевозчик")).not.toBeInTheDocument();
    expect(step(3)).toHaveAttribute("data-state", "complete");
  });

  it("shows governed payment blocking and local date errors at their operation", async () => {
    const user = userEvent.setup();
    const unavailable = {
      ...options,
      paymentMethods: options.paymentMethods.map((method) => ({
        ...method,
        enabled: false,
        unavailableReason: "contract_unavailable" as const,
      })),
    };
    const view = render(<OrderSubmitForm checkoutOptions={unavailable} submissionKey="55555555-5555-4555-8555-555555555555" />);
    expect(step(1)).toHaveAttribute("data-state", "error");
    expect(within(step(1)).getByText("Для отправки заказа нет доступного способа оплаты.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Безналичный/ })).toBeDisabled();
    view.unmount();

    renderForm();
    await user.click(screen.getByRole("radio", { name: "Безналичный" }));
    await user.type(screen.getByLabelText("Дата оплаты"), "2000-01-01");
    expect(step(2)).toHaveAttribute("data-state", "error");
    expect(within(step(2)).getByText("Проверьте дату оплаты и повторите отправку.")).toBeInTheDocument();
    expect(screen.getByLabelText("Дата оплаты")).toHaveAttribute("aria-invalid", "true");
  });

  it("places carrier failures at step 3 and cart-wide preflight failures by the final action", async () => {
    const user = userEvent.setup();
    mocks.submit.mockResolvedValueOnce({ success: false, errorCode: "ORDER_CARRIER_REQUIRED", message: "", data: null });
    const view = renderForm();
    await completeDeliveryFlow(user);
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));
    expect(await within(step(3)).findByText("Выберите перевозчика для доставки.")).toBeInTheDocument();
    view.unmount();

    mocks.submit.mockResolvedValueOnce({ success: false, errorCode: "ORDER_PRICE_CHANGED", message: "", data: null });
    renderForm();
    await completePickupFlow(user);
    await user.click(screen.getByRole("button", { name: "Отправить заказ" }));
    const priceError = await screen.findByText(/Цена одной или нескольких позиций изменилась/);
    expect(priceError.closest("section")).toBeNull();
  });

  it("uses concise natural Romanian labels and exposes state without relying on color", () => {
    render(
      <PartnerLocaleProvider locale="ro">
        <OrderSubmitForm checkoutOptions={options} submissionKey="55555555-5555-4555-8555-555555555555" />
      </PartnerLocaleProvider>,
    );
    expect(screen.getByRole("region", { name: /Pasul 1: Forma de plată, activ/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("region", { name: /Pasul 2: Data plății, indisponibil/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Pasul 3: Metoda de livrare, indisponibil/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Pasul 4: Data rezervării, indisponibil/ })).toBeInTheDocument();
  });
});

function renderForm() {
  return render(<OrderSubmitForm checkoutOptions={options} submissionKey="55555555-5555-4555-8555-555555555555" />);
}

function step(number: number) {
  return document.querySelector<HTMLElement>(`[data-checkout-step="${number}"]`)!;
}

async function completePickupFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Безналичный" }));
  await user.type(screen.getByLabelText("Дата оплаты"), "2099-01-09");
  await user.click(screen.getByRole("radio", { name: "Самовывоз" }));
  await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
}

async function completeDeliveryFlow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Безналичный" }));
  await user.type(screen.getByLabelText("Дата оплаты"), "2099-01-09");
  await user.click(screen.getByRole("radio", { name: "Доставка" }));
  await user.selectOptions(screen.getByLabelText("Перевозчик"), options.carriers[0].id);
  await user.type(screen.getByLabelText("Дата резервации"), "2099-01-10");
}
