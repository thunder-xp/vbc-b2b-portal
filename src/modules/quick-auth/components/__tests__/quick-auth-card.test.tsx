import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  submitEmail: vi.fn(),
  resend: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../actions", () => ({
  startQuickAuthAction: mocks.start,
  submitBusinessQuickAuthEmailAction: mocks.submitEmail,
  resendQuickAuthOtpAction: mocks.resend,
  verifyQuickAuthOtpAction: mocks.verify,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));

import { QuickAuthCard } from "../QuickAuthCard";

describe("QuickAuthCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one compact accessible RU phone step and accepts a pasted canonical phone", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "NOT_REGISTERED" });
    render(<QuickAuthCard locale="ru" />);

    expect(screen.getByLabelText("Телефон")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByRole("link", { name: "Войти с email и паролем" })).toHaveAttribute("href", "/auth/sign-in?lang=ru");
    expect(screen.queryByText(/^RU$|^RO$/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Телефон"), "+37369982220");
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(mocks.start).toHaveBeenCalledWith("69982220");
    expect(await screen.findByRole("heading", { name: "Ваш личный кабинет ещё не активирован" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в каталог" })).toHaveAttribute("href", "/catalog?lang=ru");
  });

  it("does not silently truncate an invalid phone to eight digits", async () => {
    render(<QuickAuthCard locale="ro" />);

    await userEvent.type(screen.getByLabelText("Telefon"), "699822200");
    expect(screen.getByRole("button", { name: "Continuă" })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("renders RO OTP without role disclosure and routes only after successful verification", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    mocks.verify.mockResolvedValue({ ok: true, step: "AUTHENTICATED", redirectTo: "/account" });
    render(<QuickAuthCard locale="ro" />);

    await userEvent.type(screen.getByLabelText("Telefon"), "69982220");
    await userEvent.click(screen.getByRole("button", { name: "Continuă" }));
    expect(await screen.findByRole("heading", { name: "Cod de confirmare" })).toBeInTheDocument();
    expect(screen.getByLabelText("Codul din SMS")).toHaveAttribute("autocomplete", "one-time-code");
    expect(document.body).not.toHaveTextContent(/Agent|Partener|Instalator/i);

    await userEvent.type(screen.getByLabelText("Codul din SMS"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmă" }));
    expect(mocks.verify).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "69982220", "123456", "ro");
    expect(mocks.replace).toHaveBeenCalledWith("/account");
  });

  it("keeps the Business email step neutral and sends OTP only after the pair is accepted", async () => {
    mocks.start.mockResolvedValue({ ok: true, step: "EMAIL", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    mocks.submitEmail.mockResolvedValue({ ok: true, step: "OTP", challengeId: "11111111-1111-4111-8111-111111111111", maskedPhone: "+373 ** *** 20" });
    render(<QuickAuthCard locale="ru" />);

    await userEvent.type(screen.getByLabelText("Телефон"), "69982220");
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(await screen.findByRole("heading", { name: "Введите email" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/агент|партн[её]р|установщик/i);
    await userEvent.type(screen.getByLabelText("Email"), "business@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(mocks.submitEmail).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "69982220", "business@example.com");
    expect(await screen.findByRole("heading", { name: "Код подтверждения" })).toBeInTheDocument();
  });
});
