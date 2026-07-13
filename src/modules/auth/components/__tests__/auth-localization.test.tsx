import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterPage from "@/app/auth/register/page";
import SignInPage from "@/app/auth/sign-in/page";
import { authCopy, localizeRegistrationError, localizeSignInError } from "../../auth-copy";
import { PUBLIC_LOCALE_STORAGE_KEY } from "@/src/modules/public-locale";

vi.mock("../../actions/auth.actions", () => ({
  registerAction: vi.fn(async () => ({ error: null })),
  signInAction: vi.fn(async () => ({ error: null })),
}));

describe("authentication localization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/auth/sign-in");
    document.documentElement.lang = "ru";
  });

  it("defaults sign-in to Russian when no locale is stored", async () => {
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
    expect(screen.getByLabelText("Электронная почта")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Стать партнёром" })).toHaveAttribute("href", "/auth/register");
  });

  it("loads Romanian sign-in from the landing locale and preserves it", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ro");
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Autentificare" })).toBeInTheDocument();
    expect(screen.getByLabelText("Adresa de e-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
    expect(screen.getByText("Ați uitat parola?")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ro");
    expect(window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY)).toBe("ro");
  });

  it("defaults an invalid stored locale to Russian", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "en");
    render(<SignInPage />);

    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("localizes the complete registration form in Romanian", async () => {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, "ro");
    render(<RegisterPage />);

    expect(await screen.findByRole("heading", { name: "Devino partener" })).toBeInTheDocument();
    expect(screen.getByLabelText("Companie")).toBeInTheDocument();
    expect(screen.getByLabelText("Țară")).toBeInTheDocument();
    expect(screen.getByLabelText("Adresa de e-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmați parola")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creați contul" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aveți deja un cont? Autentificare" })).toHaveAttribute("href", "/auth/sign-in");
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
});
