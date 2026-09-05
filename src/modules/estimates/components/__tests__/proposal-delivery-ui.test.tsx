import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerLocaleProvider } from "../../../partner-locale";

const actions = vi.hoisted(() => ({
  send: vi.fn(),
  revoke: vi.fn(),
  respond: vi.fn(),
  updateEmail: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../../actions/delivery.actions", () => ({
  sendProposalDeliveryAction: actions.send,
  revokeProposalDeliveryAction: actions.revoke,
  submitPublicProposalResponseAction: actions.respond,
}));
vi.mock("../../actions/estimate.actions", () => ({
  updateFinalCustomerEmailAction: actions.updateEmail,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../../behavior-analytics/components", () => ({ recordBehaviorInteraction: vi.fn() }));

import { PublicProposalResponse } from "../PublicProposalResponse";
import { SendProposalDialog } from "../SendProposalDialog";

const customer = { id: "customer-1", displayName: "Customer SRL", primaryEmail: "client@example.com", revision: 4 };
const props = {
  estimateId: "estimate-1",
  versionId: "version-1",
  proposalNumber: "KP-2026-000107",
  proposalTotal: "3 660,00 USD",
  pdfFilename: "KP-2026-000107.pdf",
  customer,
  canSend: true,
  emailAvailable: true,
  pdfReady: true,
  currentVersion: true,
  unsavedChanges: false,
  defaults: { recipientName: "Customer SRL", subject: "Коммерческое предложение KP-2026-000107", message: "Проект: Office" },
};

describe("guided proposal delivery UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.send.mockResolvedValue({ success: true, errorCode: null, message: "sent", data: { deliveryId: "delivery-1", publicUrl: `https://www.nsd.md/proposal/${"a".repeat(43)}`, attachedPdf: true } });
    actions.updateEmail.mockResolvedValue({ success: true, errorCode: null, message: "saved", data: { customerId: "customer-1", primaryEmail: "acceptance@example.com", revision: 5 } });
    actions.respond.mockResolvedValue({ success: true, errorCode: null, message: "accepted", data: { response: "accepted", respondedAt: "2026-07-18T10:00:00Z" } });
  });

  it("prefills the governed recipient and sends the current PDF in two intentional actions", async () => {
    const user = userEvent.setup();
    render(<SendProposalDialog {...props} />);

    await user.click(screen.getByRole("button", { name: "Отправить клиенту" }));
    expect(screen.getByText("client@example.com")).toBeInTheDocument();
    expect(screen.getByText("KP-2026-000107.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 660,00 USD")).toBeInTheDocument();
    expect(screen.getByLabelText("Тема")).not.toBeVisible();
    expect(screen.queryByText(/Ваша цена Novotech|маржа|себестоимость/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Отправить$/ }));
    await waitFor(() => expect(actions.send).toHaveBeenCalledOnce());
    expect(actions.send).toHaveBeenCalledWith(expect.objectContaining({
      versionId: "version-1",
      recipientEmail: "client@example.com",
      recipientName: "Customer SRL",
      locale: "ru",
      expirationDays: 14,
      attachPdf: true,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }));
    expect(await screen.findByText("КП отправлено на client@example.com")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("/proposal/");
  });

  it("adds a missing governed email inline without unrelated customer fields", async () => {
    const user = userEvent.setup();
    render(<SendProposalDialog {...props} customer={{ ...customer, primaryEmail: null }} />);

    await user.click(screen.getByRole("button", { name: "Добавить email" }));
    expect(screen.getByText("У клиента не указан email")).toBeInTheDocument();
    expect(screen.queryByLabelText(/название|IDNO|населённый|отрасль|тип/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Email получателя"), "ACCEPTANCE@example.com");
    await user.click(screen.getByRole("button", { name: "Сохранить email" }));

    await waitFor(() => expect(actions.updateEmail).toHaveBeenCalledWith({
      estimateId: "estimate-1",
      customerId: "customer-1",
      expectedRevision: 4,
      primaryEmail: "acceptance@example.com",
    }));
    expect(await screen.findByText("acceptance@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Отправить$/ }));
    expect(actions.send).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: "acceptance@example.com" }));
  });

  it("validates a missing email only after interaction and blocks invalid submission", async () => {
    const user = userEvent.setup();
    render(<SendProposalDialog {...props} customer={{ ...customer, primaryEmail: null }} />);
    await user.click(screen.getByRole("button", { name: "Добавить email" }));
    expect(screen.queryByText("Укажите корректный email клиента.")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Email получателя"), "invalid");
    await user.tab();
    expect(screen.getByText("Укажите корректный email клиента.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить email" }));
    expect(actions.updateEmail).not.toHaveBeenCalled();
    expect(actions.send).not.toHaveBeenCalled();
  });

  it("keeps one idempotency key for a safe retry and hides provider detail", async () => {
    const user = userEvent.setup();
    actions.send
      .mockResolvedValueOnce({ success: false, errorCode: "INVALID_STATE", message: "SMTP timeout", data: null })
      .mockResolvedValueOnce({ success: true, errorCode: null, message: "sent", data: { deliveryId: "delivery-1", publicUrl: null, attachedPdf: true } });
    render(<SendProposalDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "Отправить клиенту" }));
    await user.click(screen.getByRole("button", { name: /^Отправить$/ }));
    expect(await screen.findByRole("button", { name: "Повторить" })).toBeInTheDocument();
    expect(screen.queryByText(/SMTP|provider|RPC|Supabase/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(actions.send).toHaveBeenCalledTimes(2));
    expect(actions.send.mock.calls[1][0].idempotencyKey).toBe(actions.send.mock.calls[0][0].idempotencyKey);
  });

  it("prevents duplicate submit while delivery is in flight", async () => {
    let resolveSend!: (value: unknown) => void;
    actions.send.mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }));
    render(<SendProposalDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Отправить клиенту" }));
    const form = screen.getByRole("dialog").querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(actions.send).toHaveBeenCalledOnce());
    resolveSend({ success: true, errorCode: null, message: "sent", data: { deliveryId: "delivery-1", publicUrl: null, attachedPdf: true } });
  });

  it("blocks stale, unsaved, missing-PDF, and unavailable delivery states", () => {
    const { rerender } = render(<SendProposalDialog {...props} currentVersion={false} />);
    expect(screen.getByRole("button", { name: "Отправить клиенту" })).toBeDisabled();
    expect(screen.getByText("Смета изменилась. Подготовьте новое КП.")).toBeInTheDocument();
    rerender(<SendProposalDialog {...props} unsavedChanges />);
    expect(screen.getByText("Сначала сохраните изменения сметы.")).toBeInTheDocument();
    rerender(<SendProposalDialog {...props} pdfReady={false} />);
    expect(screen.getByText("Сначала сформируйте PDF")).toBeInTheDocument();
    rerender(<SendProposalDialog {...props} emailAvailable={false} />);
    expect(screen.getByText("Отправка по email пока недоступна")).toBeInTheDocument();
  });

  it("renders concise Romanian parity and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<PartnerLocaleProvider locale="ro"><SendProposalDialog {...props} /></PartnerLocaleProvider>);
    await user.click(screen.getByRole("button", { name: "Trimite clientului" }));
    expect(screen.getByText("Către")).toBeInTheDocument();
    expect(screen.getByText("Suplimentar")).toBeInTheDocument();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Trimite" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the governed public customer response flow", async () => {
    const user = userEvent.setup();
    render(<PublicProposalResponse initialResponse={null} locale="ro" token={"a".repeat(43)} />);
    await user.click(screen.getByRole("button", { name: "Acceptă" }));
    await user.click(screen.getByRole("button", { name: "Confirmă" }));
    expect(actions.respond).toHaveBeenCalledWith("a".repeat(43), "accepted", "", "");
  });
});
