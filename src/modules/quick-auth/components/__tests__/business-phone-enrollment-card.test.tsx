import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn(), resend: vi.fn(), verify: vi.fn() }));

vi.mock("../../enrollment.actions", () => ({
  startBusinessPhoneEnrollmentAction: mocks.start,
  resendBusinessPhoneEnrollmentAction: mocks.resend,
  verifyBusinessPhoneEnrollmentAction: mocks.verify,
}));

import { BusinessPhoneEnrollmentCard } from "../BusinessPhoneEnrollmentCard";

describe("BusinessPhoneEnrollmentCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers an optional RU enrollment prompt without blocking normal access", async () => {
    render(<BusinessPhoneEnrollmentCard confirmed={false} locale="ru" nextPath="/cabinet" />);

    expect(screen.getByRole("heading", { name: "Быстрый вход по телефону" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Позже" })).toHaveAttribute("href", "/cabinet");
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить номер" }));
    expect(screen.getByLabelText("Телефон")).toHaveAttribute("autocomplete", "tel");
  });

  it("renders the phone_change OTP step and confirmation with accessible controls", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    mocks.verify.mockResolvedValue({ ok: true, step: "CONFIRMED" });
    render(<BusinessPhoneEnrollmentCard confirmed={false} locale="ro" nextPath="/agent" />);

    await userEvent.click(screen.getByRole("button", { name: "Confirmă numărul" }));
    await userEvent.type(screen.getByLabelText("Telefon"), "69982220");
    await userEvent.click(screen.getByRole("button", { name: "Trimite codul" }));
    expect(await screen.findByRole("heading", { name: "Cod de confirmare" })).toBeInTheDocument();
    expect(screen.getByLabelText("Codul din SMS")).toHaveAttribute("autocomplete", "one-time-code");

    await userEvent.type(screen.getByLabelText("Codul din SMS"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmă" }));
    expect(mocks.verify).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "69982220", "123456");
    expect(await screen.findByText("Numărul a fost confirmat. Autentificarea rapidă este disponibilă.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuă" })).toHaveAttribute("href", "/agent");
  });

  it("shows the safe conflict message without account identity disclosure", async () => {
    mocks.start.mockResolvedValue({ ok: false, error: "PHONE_CONFLICT" });
    render(<BusinessPhoneEnrollmentCard confirmed={false} locale="ru" nextPath="/cabinet" />);

    await userEvent.click(screen.getByRole("button", { name: "Подтвердить номер" }));
    await userEvent.type(screen.getByLabelText("Телефон"), "69982220");
    await userEvent.click(screen.getByRole("button", { name: "Отправить код" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Этот номер уже связан с другой учётной записью");
    expect(document.body).not.toHaveTextContent(/@|компан/i);
  });

  it("uses send-specific copy before OTP verification and keeps verification copy afterward", async () => {
    mocks.start.mockResolvedValueOnce({ ok: false, error: "UNAVAILABLE" });
    render(<BusinessPhoneEnrollmentCard confirmed={false} locale="ru" nextPath="/cabinet" />);

    await userEvent.click(screen.getByRole("button", { name: "Подтвердить номер" }));
    await userEvent.type(screen.getByLabelText("Телефон"), "69982220");
    await userEvent.click(screen.getByRole("button", { name: "Отправить код" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось отправить SMS-код. Попробуйте ещё раз.");

    mocks.start.mockResolvedValueOnce({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    await userEvent.click(screen.getByRole("button", { name: "Отправить код" }));
    mocks.verify.mockResolvedValueOnce({ ok: false, error: "UNAVAILABLE" });
    await userEvent.type(screen.getByLabelText("Код из SMS"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подтвердить номер. Попробуйте ещё раз.");
  });
});
