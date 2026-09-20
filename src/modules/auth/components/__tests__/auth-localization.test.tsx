import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterPage from "@/app/auth/register/page";
import CheckEmailPage from "@/app/auth/check-email/page";
import SignInPage from "@/app/auth/sign-in/page";
import { authCopy, localizeRegistrationError, localizeSignInError } from "../../auth-copy";
import { CustomerAuthEntry } from "../../components";
import { PUBLIC_LOCALE_STORAGE_KEY } from "@/src/modules/public-locale";

vi.mock("../../actions/auth.actions", () => ({
  registerAction: vi.fn(async () => ({ error: null })),
  signInAction: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/src/modules/quick-auth/actions", () => ({
  startQuickAuthAction: vi.fn(async () => ({ ok: true, step: "NOT_REGISTERED" })),
  submitBusinessQuickAuthEmailAction: vi.fn(),
  resendQuickAuthOtpAction: vi.fn(),
  verifyQuickAuthOtpAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("authentication localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/auth/sign-in");
    document.documentElement.lang = "ru";
  });

  it("defaults sign-in to Russian when no locale is stored", async () => {
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Вход в личный кабинет" })).toBeInTheDocument();
    expect(screen.getByLabelText("Электронная почта")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Стать партнёром" })).toHaveAttribute("href", "/become-partner?lang=ru");
    expect(screen.getByRole("link", { name: "Войти по номеру телефона" })).toHaveAttribute("href", "/auth/customer?lang=ru");
  });

  it("loads Romanian sign-in from the landing locale and preserves it", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ro");
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Autentificare în contul personal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adresa de e-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
    expect(screen.getByText("Ați uitat parola?")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ro");
    expect(window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY)).toBe("ro");
  });

  it("lets the Customer Quick Auth lang query override storage and persists the resolved locale", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ru");
    window.history.replaceState({}, "", "/auth/customer?lang=ro");
    render(<CustomerAuthEntry />);

    expect(await screen.findByRole("heading", { name: "Cont personal" })).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY)).toBe("ro"));
    expect(screen.queryByText(/Partener \/ Agent|rolului dumneavoastră/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /RU|RO/ })).not.toBeInTheDocument();
  });

  it("keeps customer phone auth neutral and offers one email/password fallback", async () => {
    window.history.replaceState({}, "", "/auth/customer?lang=ru");
    render(<CustomerAuthEntry />);

    expect(await screen.findByRole("heading", { name: "Личный кабинет" })).toBeInTheDocument();
    expect(screen.getByText("Быстрый вход по номеру телефона")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Войти с email и паролем" })).toHaveAttribute("href", "/auth/sign-in?lang=ru");
    expect(document.body).not.toHaveTextContent(/Агент|Инсталлятор|Партнёрский кабинет|роли/i);
    expect(screen.queryByText(/^RU$|^RO$/)).not.toBeInTheDocument();
  });

  it("defaults an invalid stored locale to Russian", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "en");
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Вход в личный кабинет" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("localizes the complete registration form in Romanian", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ro");
    render(<RegisterPage />);

    expect(await screen.findByRole("heading", { name: "Înregistrare instalator profesionist" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Forma de activitate/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Persoană fizică" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Companie/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Țară/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Adresa de e-mail/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parolă/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirmați parola/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creați contul" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aveți deja un cont? Autentificare" })).toHaveAttribute("href", "/auth/sign-in?lang=ro");
  });

  it("keeps Agent registration separate and returns to the governed application", async () => {
    window.history.replaceState({}, "", "/auth/register?lang=ru&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dru");
    render(<RegisterPage />);

    expect(await screen.findByRole("heading", { name: "Регистрация коммерческого агента" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Компания/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Страна/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Форма деятельности/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Электронная почта/)).toBeInTheDocument();
    expect(document.querySelector('input[name="intent"]')).toHaveValue("agent");
    expect(document.querySelector('input[name="next"]')).toHaveValue("/become-partner/agent?lang=ru");
    expect(screen.getByRole("link", { name: authCopy.ru.registration.alreadyRegistered })).toHaveAttribute(
      "href",
      "/auth/sign-in?lang=ru&next=%2Fbecome-partner%2Fagent%3Flang%3Dru",
    );
  });

  it("localizes known and generic action errors without changing action contracts", () => {
    expect(localizeSignInError("ru", "Email or password is incorrect.")).toBe(authCopy.ru.signIn.invalidCredentials);
    expect(localizeSignInError("ro", "unexpected")).toBe(authCopy.ro.signIn.genericError);
    expect(localizeRegistrationError("ru", "Passwords do not match.")).toBe(authCopy.ru.registration.passwordMismatch);
    expect(localizeRegistrationError("ro", "unexpected")).toBe(authCopy.ro.registration.genericError);
  });

  it("shows a localized registration success state", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ro");
    window.history.replaceState({}, "", "/auth/sign-in?registered=1");
    render(<SignInPage />);

    await waitFor(() => {
      expect(screen.getByText(authCopy.ro.signIn.registrationSuccess)).toBeInTheDocument();
    });
  });

  it("shows a distinct confirmed-email sign-in state", async () => {
    window.history.replaceState({}, "", "/auth/sign-in?lang=ru&confirmed=1&next=%2Fbecome-partner%2Fagent%3Flang%3Dru");
    render(<SignInPage />);
    expect(await screen.findByText(authCopy.ru.signIn.confirmationSuccess)).toBeInTheDocument();
    expect(document.querySelector('input[name="next"]')).toHaveValue("/become-partner/agent?lang=ru");
  });

  it("shows the localized check-email state without a second locale control", async () => {
    window.history.replaceState({}, "", "/auth/check-email?lang=ro&intent=agent&next=%2Fbecome-partner%2Fagent%3Flang%3Dro");
    render(<CheckEmailPage />);
    expect(await screen.findByRole("heading", { name: "Cont creat" })).toBeInTheDocument();
    expect(screen.getByText("Confirmați adresa de e-mail pentru a continua înregistrarea.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuă la autentificare" })).toHaveAttribute(
      "href", "/auth/sign-in?lang=ro&next=%2Fbecome-partner%2Fagent%3Flang%3Dro",
    );
    expect(screen.queryByText(/^RU$|^RO$/)).not.toBeInTheDocument();
  });

  it("preserves a validated invitation return path across auth links", async () => {
    window.history.replaceState(
      {},
      "",
      "/auth/sign-in?next=%2Fauth%2Finvitations%2Fsecure-token",
    );
    render(<SignInPage />);

    expect(await screen.findByRole("link", { name: authCopy.ru.signIn.becomePartner }))
      .toHaveAttribute(
        "href",
        "/become-partner?lang=ru&next=%2Fauth%2Finvitations%2Fsecure-token",
      );
    expect(document.querySelector('input[name="next"]')).toHaveValue(
      "/auth/invitations/secure-token",
    );
  });

  it("drops unsafe external return paths", async () => {
    window.history.replaceState({}, "", "/auth/sign-in?next=https://evil.example");
    render(<SignInPage />);
    await screen.findByRole("heading", { name: authCopy.ru.signIn.title });
    expect(document.querySelector('input[name="next"]')).not.toBeInTheDocument();
  });
});
