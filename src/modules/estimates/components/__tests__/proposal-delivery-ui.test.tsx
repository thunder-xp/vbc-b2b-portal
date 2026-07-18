import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  send: vi.fn(),
  revoke: vi.fn(),
  respond: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../../actions/delivery.actions", () => ({
  sendProposalDeliveryAction: actions.send,
  revokeProposalDeliveryAction: actions.revoke,
  submitPublicProposalResponseAction: actions.respond,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PublicProposalResponse } from "../PublicProposalResponse";
import { SendProposalDialog } from "../SendProposalDialog";

describe("proposal delivery UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.send.mockResolvedValue({ success: true, errorCode: null, message: "sent", data: { deliveryId: "delivery-1", publicUrl: `https://www.nsd.md/proposal/${"a".repeat(43)}`, attachedPdf: true } });
    actions.respond.mockResolvedValue({ success: true, errorCode: null, message: "accepted", data: { response: "accepted", respondedAt: "2026-07-18T10:00:00Z" } });
  });

  it("collects bounded email delivery fields and sends an idempotency key", async () => {
    const user = userEvent.setup();
    render(<SendProposalDialog canSend deliveries={[]} versionId="version-1" versionLabel="KP-1 / версия 1" />);
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await user.type(screen.getByLabelText("Email получателя"), "client@example.com");
    await user.click(screen.getAllByRole("button", { name: "Отправить" })[1]);
    expect(actions.send).toHaveBeenCalledWith(expect.objectContaining({ versionId: "version-1", recipientEmail: "client@example.com", locale: "ru", expirationDays: 14, attachPdf: true, idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) }));
    expect(await screen.findByLabelText("Защищённая ссылка")).toHaveValue(`https://www.nsd.md/proposal/${"a".repeat(43)}`);
  });

  it("shows delivery status without exposing a secure token", () => {
    render(<SendProposalDialog canSend={false} versionId="version-1" versionLabel="KP-1" deliveries={[{ id: "delivery-1", recipient: "client@example.com", status: "sent", statusLabel: "Отправлено", sentAt: "2026-07-18T10:00:00Z", openedAt: null, expiresAt: "2026-08-01T10:00:00Z", response: null }]} />);
    expect(screen.getByText(/client@example.com/).parentElement).toHaveTextContent("Отправлено");
    expect(document.body.textContent).not.toContain("/proposal/");
  });

  it("requires confirmation and records one Romanian customer response", async () => {
    const user = userEvent.setup();
    render(<PublicProposalResponse initialResponse={null} locale="ro" token={"a".repeat(43)} />);
    await user.click(screen.getByRole("button", { name: "Acceptă" }));
    expect(screen.getByText("Confirmați acceptarea")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmă" }));
    expect(actions.respond).toHaveBeenCalledWith("a".repeat(43), "accepted", "", "");
    expect(await screen.findByText("Oferta a fost acceptată")).toBeInTheDocument();
  });
});
